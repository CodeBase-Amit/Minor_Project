enum VIEWS {
    FILES = "files",
    CHATS = "chats",
    CLIENTS = "clients",
    RUN = "run",
    COPILOT = "copilot",
    SETTINGS = "settings",
    VIDEO_CALL = "video-call"
}

interface ViewContext {
    activeView: VIEWS
    setActiveView: (activeView: VIEWS) => void
    isSidebarOpen: boolean
    setIsSidebarOpen: (isSidebarOpen: boolean) => void
    viewComponents: { [key in VIEWS]: JSX.Element }
    viewIcons: { [key in VIEWS]: JSX.Element }
}

export { ViewContext, VIEWS }
