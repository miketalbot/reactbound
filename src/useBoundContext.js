import { createContext, useContext } from "react"

export const BoundContext = createContext({})

export function useBoundContext() {
    return useContext(BoundContext)
}
