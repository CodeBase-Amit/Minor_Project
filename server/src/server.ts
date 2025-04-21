import express, { Response, Request } from "express"
import dotenv from "dotenv"
import http from "http"
import cors from "cors"
import { SocketEvent, SocketId } from "./types/socket"
import { USER_CONNECTION_STATUS, User } from "./types/user"
import { Server } from "socket.io"
import path from "path"
import * as mediasoup from "mediasoup"
import { v4 as uuidv4 } from "uuid"
import config from "./config"
import { ActiveEditorData, setActiveEditor } from "./types/editor"

dotenv.config()

const app = express()

app.use(express.json())

app.use(cors())

app.use(express.static(path.join(__dirname, "public"))) // Serve static files

const server = http.createServer(app)
const io = new Server(server, {
	cors: {
		origin: "*",
	},
	maxHttpBufferSize: 1e8,
	pingTimeout: 60000,
})

let userSocketMap: User[] = []
let mediasoupRouter: mediasoup.types.Router

// Add rooms data structure for efficient user lookup by room
interface RoomUser {
	id: string
	username: string
	activeFile: string | null
	cursorPosition: number | null
	videoProducerId: string | null
	audioProducerId: string | null
	producers: any[]
	consumers: any[]
	isVideoEnabled: boolean
	isAudioEnabled: boolean
}

interface Room {
	users: {
		[userId: string]: RoomUser
	}
}

const rooms: {
	[roomId: string]: Room
} = {}

// Mediasoup setup
async function setupMediasoup() {
	try {
		console.log("Setting up mediasoup worker with config:", {
			logLevel: config.server.mediasoup.worker.logLevel,
			rtcMinPort: config.server.mediasoup.worker.rtcMinPort,
			rtcMaxPort: config.server.mediasoup.worker.rtcMaxPort
		});

		// Create mediasoup worker
		const worker = await mediasoup.createWorker({
			logLevel: config.server.mediasoup.worker.logLevel as mediasoup.types.WorkerLogLevel,
			logTags: config.server.mediasoup.worker.logTags as mediasoup.types.WorkerLogTag[],
			rtcMinPort: config.server.mediasoup.worker.rtcMinPort,
			rtcMaxPort: config.server.mediasoup.worker.rtcMaxPort,
		})

		// Handle worker death (must exit process, cannot recover)
		worker.on("died", () => {
			console.error("mediasoup worker died, exiting in 2 seconds...")
			setTimeout(() => process.exit(1), 2000)
		})

		// Log worker stats periodically
		setInterval(async () => {
			try {
				const usage = await worker.getResourceUsage();
				
				// Check if usage is significant
				const cpuUsage = Object.values(usage.ru_utime || {}).reduce((acc, val) => acc + val, 0);
				if (cpuUsage > 0.1) {
					console.log('mediasoup worker resource usage:', usage);
				}
			} catch (error) {
				console.error('Error getting worker resource usage:', error);
			}
		}, 60000); // Every 60 seconds

		// Create mediasoup router
		console.log("Creating mediasoup router with codecs:", config.server.mediasoup.router.mediaCodecs);
		mediasoupRouter = await worker.createRouter({
			mediaCodecs: config.server.mediasoup.router.mediaCodecs,
		})

		// Log router information
		console.log("Mediasoup router created successfully with RTP capabilities:", 
			JSON.stringify(mediasoupRouter.rtpCapabilities, null, 2));
		
		return mediasoupRouter;
	} catch (error) {
		console.error("Failed to setup mediasoup:", error)
		throw error
	}
}

// Create a WebRTC transport
async function createWebRtcTransport(): Promise<{
	transport: mediasoup.types.WebRtcTransport
	params: any
}> {
	const { listenIps, initialAvailableOutgoingBitrate } =
		config.server.mediasoup.webRtcTransport

	// Extract ICE servers from config to include in the client parameters
	const iceServers = config.server.mediasoup.webRtcTransport.iceServers;

	try {
		console.log('Creating WebRTC transport with settings:', {
			listenIps,
			enableUdp: true,
			enableTcp: true,
			preferUdp: true
		});

		const transport = await mediasoupRouter.createWebRtcTransport({
			listenIps,
			enableUdp: true,
			enableTcp: true,
			preferUdp: true,
			initialAvailableOutgoingBitrate,
			// Add additional recommended settings
			enableSctp: true, // Enable SCTP data channels
			numSctpStreams: { OS: 1024, MIS: 1024 },
		});

		console.log('Created WebRTC transport with ID:', transport.id);

		// Handle transport-level events
		transport.on('dtlsstatechange', (dtlsState) => {
			console.log(`Transport ${transport.id} DTLS state changed to ${dtlsState}`);
			
			if (dtlsState === 'failed' || dtlsState === 'closed') {
				console.error(`Transport ${transport.id} DTLS state is ${dtlsState}`);
			}
		});

		transport.observer.on('close', () => {
			console.log(`Transport ${transport.id} closed`);
		});

		// Set maximum incoming bitrate
		if (config.server.mediasoup.webRtcTransport.maxIncomingBitrate) {
			try {
				await transport.setMaxIncomingBitrate(
					config.server.mediasoup.webRtcTransport.maxIncomingBitrate
				);
				console.log(`Set max incoming bitrate for transport ${transport.id}`);
			} catch (error) {
				console.error("setMaxIncomingBitrate error:", error);
			}
		}

		// Log important information for debugging
		console.log('Transport ICE parameters:', transport.iceParameters);
		console.log('Transport ICE candidates:', transport.iceCandidates);
		console.log('Transport DTLS parameters:', transport.dtlsParameters);

		return {
			transport,
			params: {
				id: transport.id,
				iceParameters: transport.iceParameters,
				iceCandidates: transport.iceCandidates,
				dtlsParameters: transport.dtlsParameters,
				sctpParameters: transport.sctpParameters,
				iceServers // Include ICE servers in params sent to client
			},
		};
	} catch (error) {
		console.error('Error creating WebRTC transport:', error);
		throw error;
	}
}

// Create a consumer for a producer
async function createConsumer(
	consumerPeer: User,
	producer: mediasoup.types.Producer
): Promise<any> {
	// Get consumer transport
	const consumerTransport = consumerPeer.consumerTransport

	if (!consumerTransport) {
		console.error("consumerTransport not found")
		throw new Error("consumerTransport not found")
	}

	// Check if peer can consume the producer
	if (!consumerPeer.rtpCapabilities || !mediasoupRouter.canConsume({
		producerId: producer.id,
		rtpCapabilities: consumerPeer.rtpCapabilities,
	})) {
		console.error("Cannot consume - incompatible RTP capabilities")
		throw new Error("cannot consume - incompatible RTP capabilities")
	}

	try {
		console.log(`Creating consumer for producer ${producer.id}, kind: ${producer.kind}, peer: ${consumerPeer.username}`)

		// Create consumer - Always start with video paused to avoid initial flood of packets
		// Audio is automatically played
		const consumer = await consumerTransport.consume({
			producerId: producer.id,
			rtpCapabilities: consumerPeer.rtpCapabilities,
			paused: producer.kind === 'video', // Only pause video consumers initially
			appData: { 
				peerId: producer.appData?.peerId,
				peerName: producer.appData?.peerName 
			},
		})

		// Store consumer
		if (!consumerPeer.consumers) {
			consumerPeer.consumers = new Map()
		}
		consumerPeer.consumers.set(consumer.id, consumer)

		// Set up consumer close handlers
		consumer.observer.on('close', () => {
			console.log(`Consumer ${consumer.id} closed`)
			consumerPeer.consumers?.delete(consumer.id)
		})

		consumer.on('transportclose', () => {
			console.log(`Consumer transport closed for consumer ${consumer.id}`)
			consumerPeer.consumers?.delete(consumer.id)
		})

		consumer.on('producerclose', () => {
			console.log(`Producer closed for consumer ${consumer.id}`)
			consumerPeer.consumers?.delete(consumer.id)
		})

		consumer.on('producerpause', () => {
			console.log(`Producer paused for consumer ${consumer.id}`)
			// Forward producer pause to consumer
			consumer.pause()
				.then(() => console.log(`Consumer ${consumer.id} paused due to producer pause`))
				.catch((error: Error) => console.error(`Error pausing consumer ${consumer.id}:`, error))
		})

		consumer.on('producerresume', () => {
			console.log(`Producer resumed for consumer ${consumer.id}`)
			// Forward producer resume to consumer
			consumer.resume()
				.then(() => console.log(`Consumer ${consumer.id} resumed due to producer resume`))
				.catch((error: Error) => console.error(`Error resuming consumer ${consumer.id}:`, error))
		})
		
		// Debugging information
		console.log(`Consumer created with ID: ${consumer.id}, kind: ${consumer.kind}`)
		console.log(`Consumer RTP parameters:`, consumer.rtpParameters)

		return {
			producerId: producer.id,
			id: consumer.id,
			kind: consumer.kind,
			rtpParameters: consumer.rtpParameters,
			type: consumer.type,
			producerPaused: consumer.producerPaused,
			paused: consumer.paused,
			producerAppData: producer.appData
		}
	} catch (error) {
		console.error("consume error:", error)
		throw error
	}
}

// Function to get all users in a room
function getUsersInRoom(roomId: string): User[] {
	if (!roomId) {
		console.error("Attempted to get users with undefined roomId");
		return [];
	}
	
	const users = userSocketMap.filter((user) => user.roomId === roomId);
	console.log(`Found ${users.length} users in room ${roomId}`);
	return users;
}

// Function to get room id by socket id
function getRoomId(socketId: SocketId): string | null {
	const roomId = userSocketMap.find(
		(user) => user.socketId === socketId
	)?.roomId

	if (!roomId) {
		console.error("Room ID is undefined for socket ID:", socketId)
		return null
	}
	return roomId
}

function getUserBySocketId(socketId: SocketId): User | null {
	const user = userSocketMap.find((user) => user.socketId === socketId)
	if (!user) {
		console.error("User not found for socket ID:", socketId)
		return null
	}
	return user
}

// Add these helper functions before the socket connection handling

// Helper function to pause a producer and all related consumers
async function pauseProducer(producer: mediasoup.types.Producer) {
	try {
		await producer.pause();
		console.log(`Paused ${producer.kind} producer ${producer.id}`);

		// Find all consumers of this producer and pause them
		for (const user of userSocketMap) {
			if (user.consumers) {
				for (const [consumerId, consumer] of user.consumers.entries()) {
					if (consumer.producerId === producer.id) {
						await consumer.pause();
						console.log(`Producer paused for consumer ${consumer.id}`);
						consumer.emit('producerpause');
					}
				}
			}
		}
	} catch (error) {
		console.error(`Error pausing producer ${producer.id}:`, error);
	}
}

// Helper function to resume a producer and all related consumers
async function resumeProducer(producer: mediasoup.types.Producer) {
	try {
		await producer.resume();
		console.log(`Resumed ${producer.kind} producer ${producer.id}`);

		// Find all consumers of this producer and resume them
		for (const user of userSocketMap) {
			if (user.consumers) {
				for (const [consumerId, consumer] of user.consumers.entries()) {
					if (consumer.producerId === producer.id) {
						await consumer.resume();
						console.log(`Producer resumed for consumer ${consumer.id}`);
						consumer.emit('producerresume');
					}
				}
			}
		}
	} catch (error) {
		console.error(`Error resuming producer ${producer.id}:`, error);
	}
}

io.on("connection", (socket) => {
	// Handle JOIN_REQUEST event
	socket.on(SocketEvent.JOIN_REQUEST, async (user: User) => {
		console.log(`Received join request from ${user.username} for room ${user.roomId}`);
		
		// Check if username already exists in the room
		const existingUser = userSocketMap.find(
			(u) => u.roomId === user.roomId && u.username === user.username
		);
		
		if (existingUser) {
			console.log(`Username ${user.username} already exists in room ${user.roomId}`);
			socket.emit(SocketEvent.USERNAME_EXISTS);
			return;
		}
		
		// Create a new user object
		const newUser: User = {
			...user,
			socketId: socket.id,
			status: USER_CONNECTION_STATUS.ONLINE,
			cursorPosition: 0,
			typing: false,
			currentFile: null,
		};
		
		// Add user to the room
		socket.join(user.roomId);
		
		// Add user to userSocketMap
		userSocketMap.push(newUser);
		
		// Get other users in the room
		const roomUsers = getUsersInRoom(user.roomId).filter(
			(u) => u.socketId !== socket.id
		);
		
		// Notify user they've been accepted
		socket.emit(SocketEvent.JOIN_ACCEPTED, {
			user: newUser,
			users: roomUsers,
		});
		
		// Notify other users that a new user has joined
		socket.to(user.roomId).emit(SocketEvent.USER_JOINED, { user: newUser });
		
		console.log(`User ${user.username} joined room ${user.roomId}`);
	});

	// Handle user actions
	socket.on(SocketEvent.JOIN_ROOM, async (data: { roomId: string; username: string }, callback: (response: any) => void) => {
		const { roomId, username } = data;
		
		try {
			console.log(`User ${username} joining room ${roomId}`);
			
			// Add user to the room
			socket.join(roomId);
			
			// Create user object for tracking in userSocketMap if not already exists
			if (!userSocketMap.find(u => u.socketId === socket.id)) {
				const newUser: User = {
					username,
					roomId,
					socketId: socket.id,
					status: USER_CONNECTION_STATUS.ONLINE,
					cursorPosition: 0,
					typing: false,
					currentFile: null,
					hasAudio: false,
					hasVideo: false
				};
				userSocketMap.push(newUser);
			}
			
			// Track user in our rooms map
			if (!rooms[roomId]) {
				rooms[roomId] = { users: {} };
			}
			
			const userId = socket.id;
			rooms[roomId].users[userId] = { 
				id: userId, 
				username, 
				activeFile: null,
				cursorPosition: null,
				videoProducerId: null,
				audioProducerId: null,
				producers: [],
				consumers: [],
				isVideoEnabled: false,
				isAudioEnabled: false
			};
			
			console.log(`Users in room ${roomId}:`, Object.keys(rooms[roomId].users).length);
			
			// Notify other users in the room about the new user
			socket.to(roomId).emit(SocketEvent.USER_JOINED, {
				userId,
				username,
				socketId: socket.id,
				hasVideo: false,
				hasAudio: false
			});
			
			// Return the list of users already in the room to the new user
			const usersInRoom = Object.values(rooms[roomId].users).map((user: RoomUser) => ({
				id: user.id,
				username: user.username,
				socketId: user.id,
				activeFile: user.activeFile,
				cursorPosition: user.cursorPosition,
				isVideoEnabled: user.isVideoEnabled || false,
				isAudioEnabled: user.isAudioEnabled || false,
				status: USER_CONNECTION_STATUS.ONLINE,
				typing: false,
				currentFile: null,
				hasVideo: user.isVideoEnabled || false,
				hasAudio: user.isAudioEnabled || false
			}));
			
			callback({ users: usersInRoom });
		} catch (error) {
			console.error('Error joining room:', error);
			callback({ error: 'Failed to join room' });
		}
	});

	socket.on("disconnecting", () => {
		const user = getUserBySocketId(socket.id)
		if (!user) return
		const roomId = user.roomId
		socket.broadcast
			.to(roomId)
			.emit(SocketEvent.USER_DISCONNECTED, { user })
		userSocketMap = userSocketMap.filter((u) => u.socketId !== socket.id)
		socket.leave(roomId)
	})

	// Handle file actions
	socket.on(
		SocketEvent.SYNC_FILE_STRUCTURE,
		({ fileStructure, openFiles, activeFile, socketId }) => {
			io.to(socketId).emit(SocketEvent.SYNC_FILE_STRUCTURE, {
				fileStructure,
				openFiles,
				activeFile,
			})
		}
	)

	socket.on(
		SocketEvent.DIRECTORY_CREATED,
		({ parentDirId, newDirectory }) => {
			const roomId = getRoomId(socket.id)
			if (!roomId) return
			socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_CREATED, {
				parentDirId,
				newDirectory,
			})
		}
	)

	socket.on(SocketEvent.DIRECTORY_UPDATED, ({ dirId, children }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_UPDATED, {
			dirId,
			children,
		})
	})

	socket.on(SocketEvent.DIRECTORY_RENAMED, ({ dirId, newName }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_RENAMED, {
			dirId,
			newName,
		})
	})

	socket.on(SocketEvent.DIRECTORY_DELETED, ({ dirId }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast
			.to(roomId)
			.emit(SocketEvent.DIRECTORY_DELETED, { dirId })
	})

	socket.on(SocketEvent.FILE_CREATED, ({ parentDirId, newFile }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast
			.to(roomId)
			.emit(SocketEvent.FILE_CREATED, { parentDirId, newFile })
	})

	socket.on(SocketEvent.FILE_UPDATED, ({ fileId, newContent }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.FILE_UPDATED, {
			fileId,
			newContent,
		})
	})

	socket.on(SocketEvent.FILE_RENAMED, ({ fileId, newName }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.FILE_RENAMED, {
			fileId,
			newName,
		})
	})

	socket.on(SocketEvent.FILE_DELETED, ({ fileId }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.FILE_DELETED, { fileId })
	})

	// Handle user status
	socket.on(SocketEvent.USER_OFFLINE, ({ socketId }) => {
		userSocketMap = userSocketMap.map((user) => {
			if (user.socketId === socketId) {
				return { ...user, status: USER_CONNECTION_STATUS.OFFLINE }
			}
			return user
		})
		const roomId = getRoomId(socketId)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.USER_OFFLINE, { socketId })
	})

	socket.on(SocketEvent.USER_ONLINE, ({ socketId }) => {
		userSocketMap = userSocketMap.map((user) => {
			if (user.socketId === socketId) {
				return { ...user, status: USER_CONNECTION_STATUS.ONLINE }
			}
			return user
		})
		const roomId = getRoomId(socketId)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.USER_ONLINE, { socketId })
	})

	// Handle chat actions
	socket.on(SocketEvent.SEND_MESSAGE, ({ message }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast
			.to(roomId)
			.emit(SocketEvent.RECEIVE_MESSAGE, { message })
	})

	// Handle cursor position
	socket.on(SocketEvent.TYPING_START, ({ cursorPosition }) => {
		userSocketMap = userSocketMap.map((user) => {
			if (user.socketId === socket.id) {
				return { ...user, typing: true, cursorPosition }
			}
			return user
		})
		const user = getUserBySocketId(socket.id)
		if (!user) return
		const roomId = user.roomId
		socket.broadcast.to(roomId).emit(SocketEvent.TYPING_START, { user })
	})

	socket.on(SocketEvent.TYPING_PAUSE, () => {
		userSocketMap = userSocketMap.map((user) => {
			if (user.socketId === socket.id) {
				return { ...user, typing: false }
			}
			return user
		})
		const user = getUserBySocketId(socket.id)
		if (!user) return
		const roomId = user.roomId
		socket.broadcast.to(roomId).emit(SocketEvent.TYPING_PAUSE, { user })
	})

	socket.on(SocketEvent.REQUEST_DRAWING, () => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast
			.to(roomId)
			.emit(SocketEvent.REQUEST_DRAWING, { socketId: socket.id })
	})

	socket.on(SocketEvent.SYNC_DRAWING, ({ drawingData, socketId }) => {
		socket.broadcast
			.to(socketId)
			.emit(SocketEvent.SYNC_DRAWING, { drawingData })
	})

	socket.on(SocketEvent.DRAWING_UPDATE, ({ snapshot }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.DRAWING_UPDATE, {
			snapshot,
		})
	})

	// MediaSoup handlers
	socket.on(SocketEvent.GET_ROUTER_RTP_CAPABILITIES, (data, callback) => {
		try {
			if (!mediasoupRouter) {
				callback({ error: "Router not ready" })
				return
			}
			
			const peer = getUserBySocketId(socket.id)
			if (peer) {
				console.log(`Client ${peer.username} (${socket.id}) requested RTP capabilities`)
			} else {
				console.log(`Unknown client ${socket.id} requested RTP capabilities`)
			}
			
			callback(mediasoupRouter.rtpCapabilities)
		} catch (error) {
			console.error("Error sending RTP capabilities:", error)
			callback({ error: "Failed to get RTP capabilities" })
		}
	})

	// Handle JOIN_ROUTER event - this is called when a client wants to join the mediasoup router
	socket.on(SocketEvent.JOIN_ROUTER, async (data: { rtpCapabilities: any }, callback: (response: any) => void) => {
		try {
			const peer = getUserBySocketId(socket.id)
			if (!peer) {
				callback({ error: "Peer not found" })
				return
			}

			// Check if peer already joined router to prevent duplicates
			if (peer.rtpCapabilities) {
				console.log(`Peer ${peer.username} (${socket.id}) already joined router, reusing capabilities`)
				callback({ success: true, alreadyJoined: true })
				return
			}

			// Store the client's RTP capabilities
			peer.rtpCapabilities = data.rtpCapabilities
			console.log(`Peer ${peer.username} (${socket.id}) joined router with RTP capabilities`)

			callback({ success: true })
		} catch (error) {
			console.error("join router error:", error)
			callback({ error: "Failed to join router" })
		}
	})

	socket.on(SocketEvent.CREATE_PRODUCER_TRANSPORT, async (data, callback) => {
		try {
			const peer = getUserBySocketId(socket.id)
			if (!peer) {
				callback({ error: "Peer not found" })
				return
			}

			// Reject if producer transport already exists
			if (peer.producerTransport) {
				callback({ error: "Producer transport already exists" })
				return
			}

			const { transport, params } = await createWebRtcTransport()
			peer.producerTransport = transport
			callback(params)
		} catch (error) {
			console.error("createProducerTransport error:", error)
			callback({ error: "Failed to create producer transport" })
		}
	})

	socket.on(SocketEvent.CONNECT_PRODUCER_TRANSPORT, async (data, callback) => {
		try {
			const peer = getUserBySocketId(socket.id)
			if (!peer || !peer.producerTransport) {
				callback({ error: "Peer or producer transport not found" })
				return
			}

			await peer.producerTransport.connect({ dtlsParameters: data.dtlsParameters })
			callback({ success: true })
		} catch (error) {
			console.error("connectProducerTransport error:", error)
			callback({ error: "Failed to connect producer transport" })
		}
	})

	socket.on(SocketEvent.PRODUCE, async (data, callback) => {
		try {
			const peer = getUserBySocketId(socket.id)
			if (!peer || !peer.producerTransport) {
				callback({ error: "Peer or producer transport not found" })
				return
			}

			const { kind, rtpParameters, transportId } = data
			
			// Validate that the transport ID matches this peer's transport ID
			if (transportId && transportId !== peer.producerTransport.id) {
				callback({ error: "Invalid transport ID" })
				return
			}

			console.log(`Creating ${kind} producer for peer ${peer.username}, id: ${socket.id}`);

			// Create producer
			const producer = await peer.producerTransport.produce({
				kind,
				rtpParameters,
				appData: { 
					peerId: socket.id, 
					peerName: peer.username 
				}
			})

			console.log(`Producer created with ID ${producer.id}, kind: ${producer.kind}`);

			// Set up producer close handlers
			producer.observer.on('close', () => {
				console.log(`Producer ${producer.id} closed`)
				peer.producers?.delete(producer.id)
			})

			producer.on('transportclose', () => {
				console.log(`Producer transport closed for ${producer.id}`)
				peer.producers?.delete(producer.id)
			})

			// Set up score reporting
			producer.on('score', (score: any) => {
				// Log score periodically (can be useful for debugging)
				if (Math.random() < 0.1) { // Only log occasionally (10% of the time)
					console.log(`Producer ${producer.id} score:`, score)
				}
			})

			// Store producer
			if (!peer.producers) {
				peer.producers = new Map();
			}
			peer.producers.set(producer.id, producer)

			// Set user video/audio state
			if (kind === "video") {
				peer.hasVideo = true
				const roomId = peer.roomId
				socket.broadcast.to(roomId).emit(SocketEvent.VIDEO_STATE_CHANGED, {
					socketId: socket.id,
					hasVideo: true,
				})
			} else if (kind === "audio") {
				peer.hasAudio = true
				const roomId = peer.roomId
				socket.broadcast.to(roomId).emit(SocketEvent.AUDIO_STATE_CHANGED, {
					socketId: socket.id,
					hasAudio: true,
				})
			}

			callback({ id: producer.id })
		} catch (error) {
			console.error("produce error:", error)
			callback({ error: error instanceof Error ? error.message : "Failed to produce" })
		}
	})

	socket.on(SocketEvent.CREATE_CONSUMER_TRANSPORT, async (data, callback) => {
		try {
			const peer = getUserBySocketId(socket.id)
			if (!peer) {
				callback({ error: "Peer not found" })
				return
			}

			// Reject if consumer transport already exists
			if (peer.consumerTransport) {
				callback({ error: "Consumer transport already exists" })
				return
			}

			const { transport, params } = await createWebRtcTransport()
			peer.consumerTransport = transport
			callback(params)
		} catch (error) {
			console.error("createConsumerTransport error:", error)
			callback({ error: "Failed to create consumer transport" })
		}
	})

	socket.on(SocketEvent.CONNECT_CONSUMER_TRANSPORT, async (data, callback) => {
		try {
			const peer = getUserBySocketId(socket.id)
			if (!peer || !peer.consumerTransport) {
				callback({ error: "Peer or consumer transport not found" })
				return
			}

			await peer.consumerTransport.connect({ dtlsParameters: data.dtlsParameters })
			callback({ success: true })
		} catch (error) {
			console.error("connectConsumerTransport error:", error)
			callback({ error: "Failed to connect consumer transport" })
		}
	})

	socket.on(SocketEvent.CONSUME, async (data, callback) => {
		try {
			const peer = getUserBySocketId(socket.id)
			if (!peer) {
				callback({ error: "Peer not found" })
				return
			}

			const { peerId } = data
			const otherPeer = userSocketMap.find(user => user.socketId === peerId)
			if (!otherPeer) {
				callback({ error: "Source peer not found" })
				return
			}

			const consumerDetailsArray = []

			// Create consumers for all producers of the other peer
			if (otherPeer.producers && otherPeer.producers.size > 0) {
				for (const producer of otherPeer.producers.values()) {
					try {
						const consumerDetails = await createConsumer(peer, producer)
						consumerDetailsArray.push(consumerDetails)
					} catch (error) {
						console.error(`Failed to create consumer for producer ${producer.id}:`, error)
					}
				}
			}

			callback({ consumerDetailsArray })
		} catch (error) {
			console.error("consume error:", error)
			callback({ error: "Failed to consume" })
		}
	})

	// Add handler for resuming consumer
	socket.on(SocketEvent.RESUME_CONSUMER, async (data: { consumerId: string }, callback?: (response: any) => void) => {
		try {
			const peer = getUserBySocketId(socket.id)
			if (!peer) {
				callback?.({ error: "Peer not found" })
				return
			}

			const { consumerId } = data
			if (!peer.consumers || !peer.consumers.has(consumerId)) {
				callback?.({ error: "Consumer not found" })
				return
			}

			const consumer = peer.consumers.get(consumerId)
			await consumer.resume()
			console.log(`Consumer ${consumerId} resumed for peer ${peer.username}`)
			
			callback?.({ success: true })
		} catch (error) {
			console.error("resumeConsumer error:", error)
			callback?.({ error: "Failed to resume consumer" })
		}
	})

	socket.on(SocketEvent.TOGGLE_VIDEO, ({ enabled }, callback) => {
		try {
			console.log(`Toggling video for user ${getUserBySocketId(socket.id)?.username} (${socket.id}) to: ${enabled}`);
			
			// Find the user's video producers
			const user = getUserBySocketId(socket.id);
			if (!user || !user.producers) {
				console.warn(`User not found or has no producers: ${socket.id}`);
				if (typeof callback === 'function') {
					callback({ error: "User not found" });
				}
				return;
			}
			
			// Get all video producers for this user
			const videoProducers = [];
			for (const [id, producer] of user.producers.entries()) {
				if (producer.kind === 'video') {
					videoProducers.push(producer);
				}
			}
			
			console.log(`Found ${videoProducers.length} video producers to toggle`);
			
			// Toggle each video producer
			for (const producer of videoProducers) {
				if (enabled) {
					resumeProducer(producer);
				} else {
					pauseProducer(producer);
				}
			}
			
			// Update user's state
			user.hasVideo = enabled;
			
			// Broadcast state change to room
			const roomId = user.roomId;
			if (roomId) {
				socket.to(roomId).emit(SocketEvent.VIDEO_STATE_CHANGED, {
					socketId: socket.id,
					hasVideo: enabled
				});
			}
			
			// Send success response
			if (typeof callback === 'function') {
				callback({ success: true });
			}
		} catch (error) {
			console.error('toggleVideo error:', error);
			if (typeof callback === 'function') {
				callback({ error: "Failed to toggle video" });
			}
		}
	});

	socket.on(SocketEvent.TOGGLE_AUDIO, ({ enabled }, callback) => {
		try {
			console.log(`Toggling audio for user ${getUserBySocketId(socket.id)?.username} (${socket.id}) to: ${enabled}`);
			
			// Find the user's audio producers
			const user = getUserBySocketId(socket.id);
			if (!user || !user.producers) {
				console.warn(`User not found or has no producers: ${socket.id}`);
				if (typeof callback === 'function') {
					callback({ error: "User not found" });
				}
				return;
			}
			
			// Get all audio producers for this user
			const audioProducers = [];
			for (const [id, producer] of user.producers.entries()) {
				if (producer.kind === 'audio') {
					audioProducers.push(producer);
				}
			}
			
			console.log(`Found ${audioProducers.length} audio producers to toggle`);
			
			// Toggle each audio producer
			for (const producer of audioProducers) {
				if (enabled) {
					resumeProducer(producer);
				} else {
					pauseProducer(producer);
				}
			}
			
			// Update user's state
			user.hasAudio = enabled;
			
			// Broadcast state change to room
			const roomId = user.roomId;
			if (roomId) {
				socket.to(roomId).emit(SocketEvent.AUDIO_STATE_CHANGED, {
					socketId: socket.id,
					hasAudio: enabled
				});
			}
			
			// Send success response
			if (typeof callback === 'function') {
				callback({ success: true });
			}
		} catch (error) {
			console.error('toggleAudio error:', error);
			if (typeof callback === 'function') {
				callback({ error: "Failed to toggle audio" });
			}
		}
	});

	socket.on(SocketEvent.VIDEO_CALL_STARTED, (data: { username: string, roomId: string }) => {
		try {
			console.log(`${data.username} started a video call in room ${data.roomId}`);
			
			// Broadcast to all other users in the room
			const roomId = data.roomId;
			socket.to(roomId).emit(SocketEvent.VIDEO_CALL_STARTED, data);
		} catch (error) {
			console.error("Error handling video call started event:", error);
		}
	});

	socket.on(SocketEvent.GET_USERS_IN_ROOM, (data, callback) => {
		console.log(`Received ${SocketEvent.GET_USERS_IN_ROOM} request from ${socket.id}`);
		const roomId = getRoomId(socket.id);
		if (!roomId) {
			console.log(`No room found for socket ${socket.id}`);
			return callback?.({ users: [] });
		}
		
		const users = getUsersInRoom(roomId).map(user => ({
			...user,
			hasVideo: user.hasVideo || false,
			hasAudio: user.hasAudio || false
		}));
		
		console.log(`Sending ${users.length} users in room ${roomId}`);
		if (callback) {
			callback({ users });
		} else {
			socket.emit(SocketEvent.USERS_IN_ROOM, { users });
		}
	})

	socket.on(SocketEvent.ACTIVE_EDITOR_CHANGED, (data: ActiveEditorData) => {
		const { roomId, fileId, cursor } = data
		setActiveEditor(roomId, socket.id, fileId, cursor)
		
		// Also update user's currentFile in userSocketMap
		userSocketMap = userSocketMap.map((user) => {
			if (user.socketId === socket.id) {
				return { ...user, currentFile: fileId }
			}
			return user
		})
		
		// Broadcast the change to other users in the room
		socket.to(roomId).emit(SocketEvent.ACTIVE_EDITOR_CHANGED, {
			socketId: socket.id,
			fileId,
			cursor
		})
	})
})

const PORT = process.env.PORT || 3001

app.get("/", (req: Request, res: Response) => {
	// Send the index.html file
	res.sendFile(path.join(__dirname, "..", "public", "index.html"))
})

async function startServer() {
	await setupMediasoup()
	server.listen(PORT, () => {
		console.log(`Listening on port ${PORT}`)
	})
}

startServer().catch(error => {
	console.error("Failed to start server:", error)
	process.exit(1)
})
