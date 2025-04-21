<<<<<<< HEAD
# CodeFusionX

A real-time collaborative code editor with video chat capabilities.

## Features

- Real-time code collaboration
- Video and audio communication
- File system management
- Chat functionality
- Drawing/whiteboard tools

## Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- npm (v7 or higher)

### Windows Setup

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/CodeFusionX.git
   cd CodeFusionX/Code-Sync
   ```

2. Run the setup script:
   ```
   .\setup.ps1
   ```

3. Start the application:
   ```
   npm start
   ```

   This will start both the client and server concurrently.

   Alternatively, to run just the server:
   ```
   .\start-server.ps1
   ```

### Manual Setup

If you prefer to set things up manually:

1. Install root dependencies:
   ```
   npm install
   ```

2. Install client dependencies:
   ```
   cd client
   npm install
   cd ..
   ```

3. Install server dependencies:
   ```
   cd server
   npm install
   cd ..
   ```

4. Start the application:
   ```
   npm start
   ```

## Troubleshooting

### Connection Issues

If you experience connection issues:

1. Make sure both client and server are running
2. Check that the client can reach the server URL (default: http://localhost:3001)
3. Check browser console and server logs for errors
4. Try refreshing the page or restarting the application

### Video Call Issues

If video calls are not working:

1. Make sure you've granted camera and microphone permissions in your browser
2. Check if your browser supports WebRTC (Chrome, Firefox, and Edge are recommended)
3. Make sure your firewall isn't blocking WebRTC traffic

## Environment Variables

- `PORT`: Server port (default: 3001)
- `VITE_BACKEND_URL`: Client-side variable to connect to the server

## License

[MIT](LICENSE)

![logo](https://github.com/sahilatahar/Code-Sync/assets/100127570/d1ff7f52-a692-4d51-b281-358aeab9156e)

A collaborative, real-time code editor where users can seamlessly code together. It provides a platform for multiple users to enter a room, share a unique room ID, and collaborate on code simultaneously.

![GitHub contributors](https://img.shields.io/github/contributors/sahilatahar/Code-Sync?style=for-the-badge&color=48bf21)
![GitHub Repo stars](https://img.shields.io/github/stars/sahilatahar/Code-Sync?style=for-the-badge)
![GitHub issues](https://img.shields.io/github/issues/sahilatahar/Code-Sync?style=for-the-badge&color=d7af2d)
![GitHub pull requests](https://img.shields.io/github/issues-pr/sahilatahar/Code-Sync?style=for-the-badge&color=f47373)
![GitHub License](https://img.shields.io/github/license/sahilatahar/Code-Sync?style=for-the-badge&color=e67234)
![Visitors](https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2Fsahilatahar%2FCode-Sync&label=Repo%20Views&countColor=%2337d67a&labelStyle=upper)

## 🔮 Features

- 💻 Real-time collaboration on code editing across multiple files
- 📁 Create, open, edit, save, delete, and organize files and folders
- 💾 Option to download the entire codebase as a zip file
- 🚀 Unique room generation with room ID for collaboration
- 🌍 Comprehensive language support for versatile programming
- 🌈 Syntax highlighting for various file types with auto-language detection
- 🚀 Code Execution: Users can execute the code directly within the collaboration environment
- ⏱️ Instant updates and synchronization of code changes across all files and folders
- 📣 Notifications for user join and leave events
- 👥 User presence list with online/offline status indicators
- 💬 Real-time group chatting functionality
- 🎩 Real-time tooltip displaying users currently editing
- 💡 Auto suggestion based on programming language
- 🔠 Option to change font size and font family
- 🎨 Multiple themes for personalized coding experience
- 🎨 Collaborative Drawing: Enable users to draw and sketch collaboratively in real-time
- 🤖 Copilot: An AI-powered assistant that generates code, allowing you to insert, copy, or replace content seamlessly within your files.

## 🚀 Live Preview

You can view the live preview of the project [here](https://code-sync-live.vercel.app/).

## 💻 Tech Stack

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![React Router](https://img.shields.io/badge/React_Router-CA4245?style=for-the-badge&logo=react-router&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![NodeJS](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![ExpressJS](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge)
![Socket io](https://img.shields.io/badge/Socket.io-ffffff?style=for-the-badge)
![Git](https://img.shields.io/badge/GIT-E44C30?style=for-the-badge&logo=git&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

## 🔮 Features for Next Release

- **Admin Permission:** Implement an admin permission system to manage user access levels and control over certain platform features.

## 🤝 Contribute

We welcome contributions to make Code Sync even better! Follow the [contribution guidelines](CONTRIBUTING.md) to get started.

## 🌟 Support Us

If you find this helpful or valuable, please consider 🌟 starring the repository. It helps us gain visibility and encourages further development.

## 🧾 License

This project is licensed under the [MIT License](LICENSE).

## 🌟 Appreciation for Resources

Special thanks to:

- EMKC for providing the Piston API:

  - [Piston Repository](https://github.com/engineer-man/piston)
  - [Piston Docs](https://piston.readthedocs.io/en/latest/api-v2/)

- Tldraw contributors:
  - [Tldraw Repository](https://github.com/tldraw/tldraw)
  - [Tldraw Documentation](https://tldraw.dev/)

- Pollinations AI:
  - [Pollinations Repository](https://github.com/pollinations/pollinations)
  - [Pollinations Docs](https://pollinations.ai/)

## ✍️ About Developer

<table>
  <tbody>
    <tr>
      <td align="center" valign="top">
        <img src="https://github.com/sahilatahar.png" width="120px;" alt="Sahil Atahar"/>
        <br />
        <b>Sahil Atahar</b>
      </td>
    </tr>
    <tr>
        <td align="center">
            <a href="https://github.com/sahilatahar">
            <img src="https://img.shields.io/badge/GitHub-100000.svg?style=for-the-badge&logo=github&logoColor=white"/>
            </a>
            <br/>
            <a href="https://linkedin.com/in/sahilatahar">
            <img src="https://img.shields.io/badge/linkedin-%230077B5.svg?style=for-the-badge&logo=linkedin&logoColor=white"/>
            </a>
        </td>
    </tr>
  </tbody>
</table>
=======
# Minor_Project
>>>>>>> da4fefe05e950e6d6172903d440a0f85437849a8
