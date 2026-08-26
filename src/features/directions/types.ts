export type LatLngPoint = {
  latitude: number;
  longitude: number;
};

export type DirectionsResult = {
  coordinates: LatLngPoint[];
  distanceMeters: number;
  durationSeconds: number;
};
