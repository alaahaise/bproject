declare module '*.png' {
  const assetUrl: string
  export default assetUrl
}

declare module '*.png?asset' {
  const assetPath: string
  export default assetPath
}
