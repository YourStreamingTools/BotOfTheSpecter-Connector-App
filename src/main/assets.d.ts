// electron-vite resolves `?asset` imports to a runtime path string (dev: filesystem; prod: asar); this teaches TS the type.
declare module '*?asset' {
  const path: string;
  export default path;
}
