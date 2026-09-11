// Camera offsets live in the car's local frame. Follow its position immediately:
// smoothing world X introduced lateral lag and exposed the side during turns.
export function followCamera(camera, car, mode, bodyYaw = 0) {
  const [height, back] = [
    [2.05, 7.1],
    [1.35, 5.8],
    [1.04, -1.65],
  ][mode];
  const yaw = car.rotation.y + bodyYaw,
    sin = Math.sin(yaw),
    cos = Math.cos(yaw);
  camera.position.set(
    car.position.x + sin * back,
    car.position.y + height,
    car.position.z + cos * back,
  );
  camera.lookAt(
    car.position.x - sin * 8,
    car.position.y + 0.8,
    car.position.z - cos * 8,
  );
}
