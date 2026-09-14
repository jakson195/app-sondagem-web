export const SUPPORTED_RASTER_EXTENSIONS = [".tif", ".tiff", ".geotiff", ".ecw"] as const;

export const RASTER_FILE_ACCEPT = ".tif,.tiff,.geotiff,.ecw,image/tiff";

export function isSupportedRasterFile(file: File): boolean {
  const ext = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
    : "";
  return SUPPORTED_RASTER_EXTENSIONS.includes(ext as (typeof SUPPORTED_RASTER_EXTENSIONS)[number]);
}

export const RASTER_FORMAT_HINT = ".tif / .tiff / .ecw";
