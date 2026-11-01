/**
 * How the tilt pad bends: tilt grows a little faster than the distance from the centre, so small moves near
 * flat give slightly finer control and the edges sweep a little faster out to the full tilt
 */
const PAD_CURVE = 1.4

/** Pad position (−1 to 1 from the centre) to a share of the full tilt */
export const padToTilt = (u: number) => Math.sign(u) * Math.abs(u) ** PAD_CURVE
/** A share of the full tilt back to a pad position */
export const tiltToPad = (t: number) => Math.sign(t) * Math.abs(t) ** (1 / PAD_CURVE)
