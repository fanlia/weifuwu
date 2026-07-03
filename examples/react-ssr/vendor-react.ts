// Separate vendor bundles — avoid esbuild bundling React which breaks hydrateRoot internals
export {} from 'react'
export {} from 'react/jsx-runtime'
