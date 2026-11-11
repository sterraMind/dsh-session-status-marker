/// <reference types="vite/client" />

/** Minimal CSS modules type declarations so .module.css imports resolve. */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
