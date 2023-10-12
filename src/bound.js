import { useContext, useState } from "react"
import { BoundContext } from "./useBoundContext"

let boundId = 0
const Also = Symbol("Also")

/**
 * A special error type to signal cancellation.
 * Throw an instance of Cancel to skip any former processing
 * without raising an error.
 * @extends Error
 */
export class Cancel extends Error {
    constructor() {
        super()
        this.message = "Cancel"
    }
}

/**
 * A component that binds data from a context to the properties passed in.
 * The `target` is a common parameter used by other components with useBoundValue
 * to find an object to modify. The component provides a new context to
 * its descendants that includes the bound properties.
 *
 * @param {Object} props - The properties to bind to the context.
 * @param {React.ReactNode} props.children - The children to be rendered within the `BoundContext.Provider`.
 * @param {...Object} props.otherProps - Other properties to be passed down to the `BoundContext.Provider`.
 *
 * @returns {React.Element} The `BoundContext.Provider` element wrapping the children, with a value that includes
 *                          the bound properties.
 *
 * @example
 * <Bound target={someObject}>
 *   <OtherBoundComponents />
 * </Bound>
 */ export function Bound({ children, ...props }) {
    const context = useContext(BoundContext)
    context.target = context.target || {}
    const [id] = useState(() => boundId++)
    for (const [key, value] of Object.entries(props)) {
        if (value?.[Also]) {
            if (typeof context[key] === "function") {
                props[key] = (...params) => {
                    try {
                        const a = value(...params)
                        const b = context[key](...params)
                        return value[Also](a, b)
                    } catch (e) {
                        if (!(e instanceof Cancel)) {
                            throw e
                        }
                    }
                }
            }
        }
    }

    return (
        <BoundContext.Provider value={{ ...context, ...props, id }}>
            {children}
        </BoundContext.Provider>
    )
}

/**
 * A utility function to create a function that can also merge results.
 * @param {Function} fn - The function to be called.
 * @param {Function} [merge=(a, b) => a] - A function to merge the results of `fn` and the context function.
 * @returns {Function} - A new function with an attached merge method.
 * @throws Will throw an error if `fn` is not a function.
 */
export function also(fn, merge = (a, b) => a) {
    if (typeof fn !== "function")
        throw new Error("also must be called with a function")
    fn[Also] = merge
    return fn
}
