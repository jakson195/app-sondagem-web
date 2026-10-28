export type CadGoogleMapType = "roadmap" | "satellite" | "hybrid" | "terrain";

export function getGoogleMapsApiKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key || undefined;
}

export function googleMapTypeId(type: CadGoogleMapType): string {
  return type;
}
