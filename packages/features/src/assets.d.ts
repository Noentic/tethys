// Asset imports are URLs in the Vite build; TypeScript needs the shape.
declare module "*.svg" {
  const src: string;
  export default src;
}
