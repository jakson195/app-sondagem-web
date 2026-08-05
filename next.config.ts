import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
  output: "standalone",
  /** Next 16 usa Turbopack por defeito; o projeto tem webpack custom (Cesium). */
  turbopack: {},
  serverExternalPackages: ["leaflet", "@prisma/client", "cesium", "pg"],
  async rewrites() {
    const hidrogeoVite = process.env.HIDROGEO_VITE_URL?.replace(/\/$/, "");
    const hidrogeoApi =
      process.env.HIDROGEO_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8010";
    const tilesUrl =
      process.env.HIDROGEO_TILESERV_URL?.replace(/\/$/, "") || "http://localhost:7800";

    /** Vite dev (:5175) só quando HIDROGEO_VITE_URL está definido; caso contrário usa public/hidrogeo-viewer */
    const viewerRewrites = hidrogeoVite
      ? [
          {
            source: "/anm-leilao-viewer",
            destination: `${hidrogeoVite}/anm-leilao-viewer/`,
          },
          {
            source: "/anm-leilao-viewer/",
            destination: `${hidrogeoVite}/anm-leilao-viewer/`,
          },
          {
            source: "/anm-leilao-viewer/:path*",
            destination: `${hidrogeoVite}/anm-leilao-viewer/:path*`,
          },
          {
            source: "/hidrogeo-viewer",
            destination: `${hidrogeoVite}/hidrogeo-viewer/`,
          },
          {
            source: "/hidrogeo-viewer/",
            destination: `${hidrogeoVite}/hidrogeo-viewer/`,
          },
          {
            source: "/hidrogeo-viewer/:path*",
            destination: `${hidrogeoVite}/hidrogeo-viewer/:path*`,
          },
        ]
      : [
          {
            source: "/hidrogeo-viewer",
            destination: "/hidrogeo-viewer/index.html",
          },
          {
            source: "/hidrogeo-viewer/",
            destination: "/hidrogeo-viewer/index.html",
          },
          {
            source: "/anm-leilao-viewer",
            destination: "/hidrogeo-viewer/index.html",
          },
          {
            source: "/anm-leilao-viewer/",
            destination: "/hidrogeo-viewer/index.html",
          },
        ];

    const hidrogeoRewrites = [
      ...viewerRewrites,
      {
        source: "/api/anm-leilao/v1/:path*",
        destination: `${hidrogeoApi}/api/v1/:path*`,
      },
      {
        source: "/tiles/anm-leilao/:path*",
        destination: `${tilesUrl}/:path*`,
      },
      {
        source: "/api/hidrogeo/v1/:path*",
        destination: `${hidrogeoApi}/api/v1/:path*`,
      },
      {
        source: "/tiles/hidrogeo/:path*",
        destination: `${tilesUrl}/:path*`,
      },
    ];

    return {
      beforeFiles: hidrogeoRewrites,
      afterFiles: [
      {
        source: "/api/geo/api/v1/:path*",
        destination: "/api/geo/v1/:path*",
      },
      {
        source: "/geofisica/temporal",
        destination: "/geo/temporal",
      },
      {
        source: "/geofisica/temporal/:path*",
        destination: "/geo/temporal/:path*",
      },
      {
        source: "/api/geofisica/temporal/:path*",
        destination: "/api/geo/temporal/:path*",
      },
      ],
    };
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      cesium: path.resolve(__dirname, "node_modules/cesium"),
    };
    return config;
  },
};

export default nextConfig;