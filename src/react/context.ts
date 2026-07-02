import { createContext } from 'react'

/** Shared context for useServerData(). Works on both server and client. */
export const ServerDataContext = createContext<Record<string, unknown>>({})
ServerDataContext.displayName = 'ServerData'
