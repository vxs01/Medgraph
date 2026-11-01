/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // keep the ML runtime out of the webpack bundle; it is loaded natively on the server
    serverComponentsExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'sharp'],
  },
};
export default nextConfig;
