/**
 * How the tilt pad bends: tilt grows with the square of the distance from the centre, so small moves near
 * flat give fine control and the edges sweep quickly out to the full tilt
 */
const PAD_CURVE = 2

/** Pad position (−1 to 1 from the centre) to a share of the full tilt */
export const padToTilt = (u: number) => Math.sign(u) * Math.abs(u) ** PAD_CURVE
/** A share of the full tilt back to a pad position */
export const tiltToPad = (t: number) => Math.sign(t) * Math.abs(t) ** (1 / PAD_CURVE)
