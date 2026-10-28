export type CadImportKind =
  | "dwg"
  | "dxf"
  | "points-txt"
  | "points-csv"
  | "points-xlsx"
  | "geotiff"
  | "ecw"
  | "jpg"
  | "png"
  | "tiff"
  | "kml"
  | "shp"
  | "geojson"
  | "rtk";

export type CadInsertKind =
  | "point"
  | "line"
  | "polyline"
  | "polygon"
  | "circle"
  | "arc"
  | "text"
  | "dimension"
  | "block"
  | "image";

export function isPointsImport(kind: CadImportKind): boolean {
  return kind === "points-txt" || kind === "points-csv" || kind === "points-xlsx" || kind === "rtk";
}

export function importAccept(kind: CadImportKind): string {
  switch (kind) {
    case "dwg":
      return ".dwg";
    case "dxf":
      return ".dxf";
    case "points-txt":
    case "rtk":
      return ".txt,.xyz,.asc";
    case "points-csv":
      return ".csv,.txt";
    case "points-xlsx":
      return ".xlsx,.xls";
    case "geotiff":
    case "tiff":
      return ".tif,.tiff,.tfw,.tifw,.wld";
    case "ecw":
      return ".ecw";
    case "jpg":
      return ".jpg,.jpeg,.jgw,.wld";
    case "png":
      return ".png,.pgw,.wld";
    case "kml":
      return ".kml,.kmz";
    case "shp":
      return ".zip,.shp";
    case "geojson":
      return ".geojson,.json";
    default:
      return "";
  }
}

export function importAllowsMultiple(kind: CadImportKind): boolean {
  return kind === "geotiff" || kind === "ecw" || kind === "jpg" || kind === "png" || kind === "tiff";
}

export function importTitle(kind: CadImportKind): string {
  switch (kind) {
    case "dwg":
      return "Importar DWG";
    case "dxf":
      return "Importar DXF";
    case "points-txt":
    case "points-csv":
    case "points-xlsx":
    case "rtk":
      return "Importar pontos";
    case "geotiff":
      return "Importar GeoTIFF";
    case "ecw":
      return "Importar ECW";
    case "jpg":
      return "Importar JPG";
    case "png":
      return "Importar PNG";
    case "tiff":
      return "Importar TIFF";
    case "kml":
      return "Importar KML / KMZ";
    case "shp":
      return "Importar Shapefile";
    case "geojson":
      return "Importar GeoJSON";
  }
}
