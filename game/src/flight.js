// The flight model and course rules, with no rendering in them. The Kestrel is an arcade aircraft:
// the stick feeds pitch, roll and yaw rates, banked lift bends the turn, throttle sets the speed it
// settles toward, and the airbrake slows it. A gate counts only when the aircraft crosses its plane
// from the approach side, inside the hoop, in the course order.

import { Euler, Quaternion, Vector3 } from 'three';
import { COURSE_TIME, RINGS, START } from './config.js';
import { clamp } from './noise.js';

export const EVENT_RING = 1;
export const EVENT_CRASH = 2;
export const EVENT_FINISH = 4;
export const EVENT_TIMEOUT = 8;

const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const LOCAL_FORWARD = new Vector3(0, 0, -1);
const LOCAL_RIGHT = new Vector3(1, 0, 0);

function headingOf(direction) {
  return (Math.atan2(direction.x, -direction.z) * 180) / Math.PI;
}

function rad(degrees) {
  return (degrees * Math.PI) / 180;
}

export function createFlight() {
  const rings = RINGS.map((ring, index) => {
    const previous = index === 0 ? START : RINGS[index - 1];
    const normal = new Vector3(ring.x - previous.x, 0, ring.z - previous.z);
    if (normal.lengthSq() < 1) normal.set(0, 0, -1);
    normal.normalize();
    return {
      index,
      center: new Vector3(ring.x, ring.y, ring.z),
      normal,
      radius: ring.radius,
      heading: headingOf(normal),
    };
  });

  const state = {
    position: new Vector3(),
    quaternion: new Quaternion(),
    previous: new Vector3(),
    forward: new Vector3(0, 0, -1),
    right: new Vector3(1, 0, 0),
    up: new Vector3(0, 1, 0),
    speed: START.speed,
    throttle: START.throttle,
    heading: START.heading,
    pitchDeg: 0,
    bank: 0,
    verticalSpeed: 0,
    altitude: 0,
    clearance: 0,
    timeLeft: COURSE_TIME,
    elapsed: 0,
    ringsPassed: 0,
    phase: 'flying',
    view: 'chase',
    stick: { pitch: 0, roll: 0, yaw: 0 },
    brake: false,
    stall: false,
    lastEvent: 0,
  };

  const scratch = new Vector3();
  const turnQuat = new Quaternion();
  const localQuat = new Quaternion();
  const crossing = new Vector3();
  const radial = new Vector3();

  function updateDerived() {
    state.forward.copy(LOCAL_FORWARD).applyQuaternion(state.quaternion);
    state.right.copy(LOCAL_RIGHT).applyQuaternion(state.quaternion);
    state.up.copy(Y_AXIS).applyQuaternion(state.quaternion);
    state.heading = ((Math.atan2(state.forward.x, -state.forward.z) * 180) / Math.PI + 360) % 360;
    state.pitchDeg = (Math.asin(clamp(state.forward.y, -1, 1)) * 180) / Math.PI;
    state.bank = Math.atan2(state.right.y, state.up.y);
    state.altitude = state.position.y;
  }

  function setPose({ x, y, z, heading = 0, pitch = 0, roll = 0, speed = START.speed, throttle = START.throttle }) {
    state.position.set(x, y, z);
    state.previous.copy(state.position);
    state.quaternion.setFromEuler(new Euler(pitch, -rad(heading), roll, 'YXZ'));
    state.speed = speed;
    state.throttle = throttle;
    state.stick.pitch = 0;
    state.stick.roll = 0;
    state.stick.yaw = 0;
    updateDerived();
  }

  function reset() {
    state.timeLeft = COURSE_TIME;
    state.elapsed = 0;
    state.ringsPassed = 0;
    state.phase = 'flying';
    state.view = 'chase';
    state.brake = false;
    state.stall = false;
    state.verticalSpeed = 0;
    state.lastEvent = 0;
    setPose(START);
  }

  function stage(name) {
    reset();
    if (name === 'chase') {
      const ring = rings[0];
      const position = ring.center.clone().addScaledVector(ring.normal, -272);
      state.ringsPassed = 0;
      state.timeLeft = 163;
      setPose({
        x: position.x,
        y: 202,
        z: position.z,
        heading: ring.heading,
        pitch: -0.055,
        roll: -0.17,
        speed: 148,
        throttle: 0.72,
      });
    } else if (name === 'cockpit') {
      const ring = rings[1];
      const position = ring.center.clone().addScaledVector(ring.normal, -310);
      state.ringsPassed = 1;
      state.timeLeft = 143;
      state.view = 'cockpit';
      setPose({
        x: position.x,
        y: ring.center.y + 14,
        z: position.z,
        heading: ring.heading,
        pitch: -0.015,
        roll: 0.11,
        speed: 143,
        throttle: 0.73,
      });
    } else if (name === 'runway') {
      state.ringsPassed = 0;
      state.timeLeft = 172;
      setPose({
        x: 0,
        y: 58,
        z: 2075,
        heading: 0,
        pitch: -0.075,
        roll: 0.04,
        speed: 122,
        throttle: 0.56,
      });
    } else {
      const ring = rings[0];
      const position = ring.center.clone().addScaledVector(ring.normal, -285);
      state.ringsPassed = 0;
      state.timeLeft = 168;
      setPose({
        x: position.x,
        y: 194,
        z: position.z,
        heading: ring.heading,
        pitch: -0.06,
        roll: -0.05,
        speed: 139,
        throttle: 0.68,
      });
    }
    state.phase = 'flying';
  }

  function step(dt, axes, terrainHeightAt) {
    if (state.phase !== 'flying') return 0;
    let events = 0;
    state.elapsed += dt;
    state.timeLeft = Math.max(0, state.timeLeft - dt);

    // Throttle is a lever: it moves while the key is held, then stays where it is.
    state.throttle = clamp(state.throttle + axes.throttle * 0.62 * dt, 0.05, 1);
    state.brake = axes.brake;

    // Smooth the stick so keyboard taps are not instant full-deflection snaps.
    const ease = 1 - Math.exp(-7 * dt);
    state.stick.pitch += (axes.pitch - state.stick.pitch) * ease;
    state.stick.roll += (axes.roll - state.stick.roll) * ease;
    state.stick.yaw += (axes.yaw - state.stick.yaw) * ease;

    const speedBefore = state.forward.y;
    localQuat.setFromAxisAngle(X_AXIS, state.stick.pitch * 1.05 * dt);
    state.quaternion.multiply(localQuat);
    localQuat.setFromAxisAngle(Z_AXIS, -state.stick.roll * 2.35 * dt);
    state.quaternion.multiply(localQuat);
    localQuat.setFromAxisAngle(Y_AXIS, -state.stick.yaw * 0.55 * dt);
    state.quaternion.multiply(localQuat);

    // A little wing-leveller when the stick is released keeps sightseeing forgiving.
    updateDerived();
    if (Math.abs(state.stick.roll) < 0.04) {
      localQuat.setFromAxisAngle(Z_AXIS, -state.right.y * 1.3 * dt);
      state.quaternion.multiply(localQuat);
    }

    // Banked lift turns the aircraft; this is what makes rolling with the mouse a real turn.
    updateDerived();
    turnQuat.setFromAxisAngle(Y_AXIS, state.right.y * 0.85 * dt);
    state.quaternion.premultiply(turnQuat);

    // A stalled wing drops its nose. It is a warning, not an instant loss of control.
    state.stall = state.speed < 54;
    if (state.stall) {
      localQuat.setFromAxisAngle(X_AXIS, -(54 - state.speed) * 0.02 * dt);
      state.quaternion.multiply(localQuat);
    }

    updateDerived();

    // Airspeed: throttle target, minus the cost of climbing, plus the gain of a dive.
    let target = 58 + state.throttle * 124;
    if (state.brake) target -= 52;
    target -= state.forward.y * 24;
    target = clamp(target, 40, 232);
    state.speed += (target - state.speed) * 0.55 * dt;
    state.speed = clamp(state.speed, 30, 236);

    // The previous speed's climb term is kept for a slightly softer pitch feel.
    if (Math.abs(speedBefore) > 0.001) state.speed -= speedBefore * 0.3 * dt;
    state.speed = clamp(state.speed, 30, 236);

    state.previous.copy(state.position);
    state.position.addScaledVector(state.forward, state.speed * dt);

    // Low-speed sink, and just enough drag to make the airbrake feel weighty.
    if (state.speed < 68) state.position.y -= (1 - state.speed / 68) * 5.2 * dt;
    if (state.brake) state.position.y -= Math.max(0, state.forward.y) * 0.8 * dt;

    updateDerived();
    state.verticalSpeed = (state.position.y - state.previous.y) / dt;
    state.altitude = state.position.y;
    const ground = Math.max(0, terrainHeightAt(state.position.x, state.position.z));
    state.clearance = state.position.y - ground;

    // Gate crossing: only the next gate counts, and only in the order of the course.
    if (state.ringsPassed < rings.length) {
      const ring = rings[state.ringsPassed];
      const previousSide = scratch.copy(state.previous).sub(ring.center).dot(ring.normal);
      const side = scratch.copy(state.position).sub(ring.center).dot(ring.normal);
      if (previousSide < 0 && side >= 0) {
        const t = previousSide === side ? 0 : previousSide / (previousSide - side);
        crossing.copy(state.previous).lerp(state.position, t).sub(ring.center);
        crossing.addScaledVector(ring.normal, -crossing.dot(ring.normal));
        if (crossing.length() <= ring.radius + 1.5) {
          state.ringsPassed += 1;
          state.lastEvent = EVENT_RING;
          events |= EVENT_RING;
          if (state.ringsPassed === rings.length) {
            state.phase = 'finished';
            events |= EVENT_FINISH;
            return events;
          }
        }
      }
    }

    if (state.position.y < Math.max(2.4, ground + 3.6)) {
      state.phase = 'crashed';
      state.altitude = ground;
      state.lastEvent = EVENT_CRASH;
      return events | EVENT_CRASH;
    }
    if (state.timeLeft <= 0) {
      state.phase = 'timedout';
      state.lastEvent = EVENT_TIMEOUT;
      return events | EVENT_TIMEOUT;
    }
    return events;
  }

  function currentRing() {
    return state.ringsPassed < rings.length ? rings[state.ringsPassed] : null;
  }

  reset();

  return {
    state,
    rings,
    reset,
    stage,
    step,
    setPose,
    currentRing,
    updateDerived,
  };
}
