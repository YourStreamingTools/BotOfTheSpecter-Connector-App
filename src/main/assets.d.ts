// electron-vite handles `?asset` imports at build time, returning a runtime path
// (dev: filesystem path; prod: asar path). This declaration just teaches TS the type.
declare module '*?asset' {
  const path: string;
  export default path;
}
