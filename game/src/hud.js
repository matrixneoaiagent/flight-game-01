// The HUD and the lit instrument panel. A full-window 2D canvas sits over the WebGL view and is
// redrawn each frame: data boxes, a clipped pitch ladder, gate cue, warnings and four or six
// glowing instruments. All labels and numbers come straight from the flight state, so a key press
// visibly moves them.

import { PALETTE } from './config.js';

const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = 'ui-monospace, "SFMono-Regular", "DejaVu Sans Mono", monospace';

const CYAN = PALETTE.cyan;
const CYAN_SOFT = PALETTE.cyanSoft;
const AMBER = PALETTE.amber;
const GOLD = PALETTE.gold;
const MINT = PALETTE.mint;
const RED = PALETTE.red;
const INK = PALETTE.ink;
const MUTED = PALETTE.muted;

function formatTime(seconds) {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function notchedPath(context, x, y, width, height, cut) {
  context.beginPath();
  context.moveTo(x + cut, y);
  context.lineTo(x + width, y);
  context.lineTo(x + width, y + height - cut);
  context.lineTo(x + width - cut, y + height);
  context.lineTo(x, y + height);
  context.lineTo(x, y + cut);
  context.closePath();
}

export function createHud(canvas, { scale } = {}) {
  const context = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize() {
    dpr = scale ?? Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  resize();
  window.addEventListener('resize', resize);

  function panel(x, y, w, h, cut, accent = CYAN) {
    notchedPath(context, x, y, w, h, cut);
    const gradient = context.createLinearGradient(x, y, x, y + h);
    gradient.addColorStop(0, 'rgba(8,24,34,0.86)');
    gradient.addColorStop(1, 'rgba(3,13,20,0.74)');
    context.fillStyle = gradient;
    context.fill();
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(126,241,255,0.22)';
    context.stroke();
    context.strokeStyle = accent;
    context.globalAlpha = 0.85;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x + cut + 2, y + 1);
    context.lineTo(x + w * 0.45, y + 1);
    context.stroke();
    context.globalAlpha = 1;
  }

  function label(text, x, y, size, color = MUTED, align = 'left') {
    context.font = `600 ${size}px ${SANS}`;
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(text, x, y);
  }

  function mono(text, x, y, size, color = INK, align = 'left', weight = 600) {
    context.font = `${weight} ${size}px ${MONO}`;
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(text, x, y);
  }

  function glowText(text, x, y, font, color, align = 'center', blur = 12) {
    context.save();
    context.font = font;
    context.textAlign = align;
    context.textBaseline = 'middle';
    context.shadowColor = color;
    context.shadowBlur = blur;
    context.fillStyle = color;
    context.fillText(text, x, y);
    context.restore();
  }

  function drawDataBox(x, y, w, h, caption, value, unit, accent, progress) {
    panel(x, y, w, h, 9, accent);
    label(caption, x + 13, y + 19, 9.5, accent);
    const valueSize = Math.min(h * 0.42, w * 0.21);
    mono(String(value), x + 13, y + h - 14, valueSize, INK, 'left', 650);
    mono(unit, x + w - 13, y + h - 14, 11, MUTED, 'right', 600);
    context.fillStyle = 'rgba(126,241,255,0.1)';
    context.fillRect(x + 13, y + h - 6, w - 26, 2);
    context.fillStyle = accent;
    context.fillRect(x + 13, y + h - 6, (w - 26) * clamp(progress, 0, 1), 2);
  }

  function drawTop(state, guide, time, view) {
    const s = Math.min(width / 1280, height / 800);
    const speedKt = Math.round(state.speed * 1.94384);
    const altitudeFt = Math.round(state.altitude * 3.28084);
    const heading = Math.round(state.heading) % 360;
    const throttle = Math.round(state.throttle * 100);
    const timeText = formatTime(state.timeLeft);
    const timeColor = state.timeLeft < 20 ? RED : state.timeLeft < 45 ? AMBER : CYAN_SOFT;

    const boxW = 178 * s;
    const boxH = 70 * s;
    drawDataBox(22 * s, 20 * s, boxW, boxH, 'AIRSPEED', speedKt, 'KT', CYAN, speedKt / 430);
    drawDataBox(22 * s, 98 * s, boxW, boxH, 'ALTITUDE', altitudeFt, 'FT', AMBER, altitudeFt / 5200);

    // Course panel: gate diamonds on the left, the timer on the right.
    const courseW = 366 * s;
    const courseH = 70 * s;
    const courseX = (width - courseW) / 2;
    const courseY = 20 * s;
    panel(courseX, courseY, courseW, courseH, 9, CYAN);
    label('GATE', courseX + 15 * s, courseY + 19 * s, 9.5, CYAN);
    label('COURSE CLOCK', courseX + courseW - 15 * s, courseY + 19 * s, 9.5, MUTED, 'right');
    for (let index = 0; index < 5; index += 1) {
      const dx = courseX + 25 * s + index * 19 * s;
      const dy = courseY + 43 * s;
      const size = 6 * s;
      context.save();
      context.translate(dx, dy);
      context.rotate(Math.PI / 4);
      if (index < state.ringsPassed) {
        context.fillStyle = MINT;
        context.shadowColor = MINT;
        context.shadowBlur = 7;
        context.fillRect(-size, -size, size * 2, size * 2);
      } else if (index === state.ringsPassed) {
        context.strokeStyle = CYAN;
        context.lineWidth = 1.6;
        context.shadowColor = CYAN;
        context.shadowBlur = 10;
        context.strokeRect(-size, -size, size * 2, size * 2);
      } else {
        context.strokeStyle = 'rgba(143,179,193,0.45)';
        context.lineWidth = 1;
        context.strokeRect(-size, -size, size * 2, size * 2);
      }
      context.restore();
    }
    mono(`${state.ringsPassed}/5`, courseX + 128 * s, courseY + 49 * s, 15 * s, MUTED, 'left', 600);
    context.save();
    context.shadowColor = timeColor;
    context.shadowBlur = 12;
    mono(timeText, courseX + courseW - 15 * s, courseY + 51 * s, 26 * s, timeColor, 'right', 700);
    context.restore();

    // Heading readout, with a compact compass ribbon.
    const rightX = width - 200 * s;
    panel(rightX, 20 * s, 178 * s, boxH, 9, MINT);
    label('HEADING', rightX + 13 * s, 39 * s, 9.5, MINT);
    mono(`${String(heading).padStart(3, '0')}°`, rightX + 13 * s, 75 * s, 28 * s, INK, 'left', 650);
    context.strokeStyle = 'rgba(141,247,208,0.28)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(rightX + 104 * s, 53 * s);
    context.lineTo(rightX + 164 * s, 53 * s);
    context.stroke();
    for (let tick = 0; tick < 7; tick += 1) {
      const tx = rightX + 104 * s + tick * 10 * s;
      context.beginPath();
      context.moveTo(tx, 49 * s);
      context.lineTo(tx, 53 * s + (tick % 3 === 0 ? 5 : 3) * s);
      context.stroke();
    }
    const markerX = rightX + 134 * s;
    context.fillStyle = MINT;
    context.beginPath();
    context.moveTo(markerX, 57 * s);
    context.lineTo(markerX - 3 * s, 62 * s);
    context.lineTo(markerX + 3 * s, 62 * s);
    context.closePath();
    context.fill();

    // Throttle readout.
    panel(rightX, 98 * s, 178 * s, boxH, 9, GOLD);
    label('THROTTLE', rightX + 13 * s, 117 * s, 9.5, GOLD);
    mono(`${String(throttle).padStart(2, '0')}%`, rightX + 13 * s, 153 * s, 28 * s, INK, 'left', 650);
    const barX = rightX + 100 * s;
    for (let index = 0; index < 8; index += 1) {
      context.fillStyle = index < Math.round(throttle / 12.5) ? GOLD : 'rgba(143,179,193,0.18)';
      context.fillRect(barX + index * 8 * s, 137 * s, 5 * s, 16 * s);
    }

    // A small, unmistakable view annunciation under the throttle box.
    context.save();
    context.beginPath();
    context.arc(rightX + 9 * s, 186 * s, 2.5 * s, 0, Math.PI * 2);
    context.fillStyle = view === 'cockpit' ? AMBER : CYAN;
    context.shadowColor = context.fillStyle;
    context.shadowBlur = 8;
    context.fill();
    context.restore();
    label(view === 'cockpit' ? 'COCKPIT CAMERA' : 'CHASE CAMERA', rightX + 17 * s, 189 * s, 8, view === 'cockpit' ? AMBER : 'rgba(165,247,255,0.7)');
  }

  function drawPitchLadder(state, time) {
    const s = Math.min(width / 1280, height / 800);
    const cx = width / 2;
    const cy = height * 0.46;
    context.save();
    context.beginPath();
    context.rect(cx - 300 * s, cy - 190 * s, 600 * s, 330 * s);
    context.clip();
    context.translate(cx, cy);
    context.rotate(state.bank);
    context.strokeStyle = 'rgba(165,247,255,0.24)';
    context.fillStyle = 'rgba(165,247,255,0.4)';
    context.lineWidth = 1;
    context.setLineDash([3, 5]);
    for (let pitch = -30; pitch <= 30; pitch += 10) {
      const y = (state.pitchDeg - pitch) * 4.2 * s;
      if (y < -175 * s || y > 170 * s) continue;
      if (pitch === 0) {
        context.strokeStyle = 'rgba(165,247,255,0.42)';
        context.beginPath();
        context.moveTo(-170 * s, y);
        context.lineTo(-34 * s, y);
        context.moveTo(34 * s, y);
        context.lineTo(170 * s, y);
        context.stroke();
        context.setLineDash([3, 5]);
        continue;
      }
      context.beginPath();
      context.moveTo(-130 * s, y);
      context.lineTo(-38 * s, y);
      context.moveTo(38 * s, y);
      context.lineTo(130 * s, y);
      context.stroke();
      context.font = `500 ${10 * s}px ${MONO}`;
      context.textAlign = 'right';
      context.fillText(String(Math.abs(pitch)), -136 * s, y + 3.5 * s);
      context.textAlign = 'left';
      context.fillText(String(Math.abs(pitch)), 136 * s, y + 3.5 * s);
    }
    context.setLineDash([]);
    context.restore();

    // Bank scale.
    context.save();
    context.translate(cx, cy);
    context.strokeStyle = 'rgba(165,247,255,0.3)';
    context.lineWidth = 1;
    for (let angle = -60; angle <= 60; angle += 15) {
      const radians = (angle * Math.PI) / 180 - Math.PI / 2;
      const inner = angle % 30 === 0 ? 118 : 124;
      context.beginPath();
      context.moveTo(Math.cos(radians) * inner * s, Math.sin(radians) * inner * s);
      context.lineTo(Math.cos(radians) * 132 * s, Math.sin(radians) * 132 * s);
      context.stroke();
    }
    const bankAngle = -Math.PI / 2 + state.bank;
    context.fillStyle = 'rgba(165,247,255,0.75)';
    context.beginPath();
    context.moveTo(Math.cos(bankAngle) * 107 * s, Math.sin(bankAngle) * 107 * s);
    context.lineTo(Math.cos(bankAngle - 0.055) * 117 * s, Math.sin(bankAngle - 0.055) * 117 * s);
    context.lineTo(Math.cos(bankAngle + 0.055) * 117 * s, Math.sin(bankAngle + 0.055) * 117 * s);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawReticle(state, time) {
    const s = Math.min(width / 1280, height / 800);
    const cx = width / 2;
    const cy = height * 0.46;
    const pulse = 0.65 + 0.35 * Math.sin(time * 3.1);
    context.save();
    context.strokeStyle = `rgba(126,241,255,${0.65 + pulse * 0.22})`;
    context.shadowColor = CYAN;
    context.shadowBlur = 8;
    context.lineWidth = 1.4;
    context.beginPath();
    context.arc(cx, cy, 8 * s, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(cx - 32 * s, cy);
    context.lineTo(cx - 13 * s, cy);
    context.moveTo(cx + 13 * s, cy);
    context.lineTo(cx + 32 * s, cy);
    context.moveTo(cx, cy - 26 * s);
    context.lineTo(cx, cy - 12 * s);
    context.stroke();
    context.fillStyle = CYAN;
    context.beginPath();
    context.arc(cx, cy, 1.7 * s, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawGuide(guide, state, time) {
    if (!guide || guide.index === null) return;
    const s = Math.min(width / 1280, height / 800);
    const marginX = 90 * s;
    const marginTop = 150 * s;
    const marginBottom = height - 190 * s;
    let x = guide.x;
    let y = guide.y;
    const onScreen = guide.inFront && x > marginX && x < width - marginX && y > marginTop && y < marginBottom;
    x = clamp(x, marginX, width - marginX);
    y = clamp(y, marginTop, marginBottom);
    const distance = guide.distance < 1000 ? `${Math.round(guide.distance / 10) * 10} M` : `${(guide.distance / 1000).toFixed(2)} KM`;
    const pulse = 0.7 + 0.3 * Math.sin(time * 2.8);
    context.save();
    context.strokeStyle = onScreen ? CYAN : AMBER;
    context.fillStyle = onScreen ? CYAN : AMBER;
    context.shadowColor = onScreen ? CYAN : AMBER;
    context.shadowBlur = onScreen ? 13 : 8;
    context.lineWidth = 1.6;
    if (onScreen) {
      context.beginPath();
      for (let corner = 0; corner < 4; corner += 1) {
        const quadrant = corner * Math.PI * 0.5 + Math.PI * 0.25;
        const ox = Math.cos(quadrant) * 27 * s;
        const oy = Math.sin(quadrant) * 27 * s;
        context.moveTo(x + ox * 0.58, y + oy * 0.58);
        context.lineTo(x + ox, y + oy);
      }
      context.stroke();
      context.beginPath();
      context.arc(x, y, 15 * s * pulse, 0, Math.PI * 2);
      context.stroke();
    } else {
      const angle = Math.atan2(y - height / 2, x - width / 2);
      context.translate(x, y);
      context.rotate(angle + Math.PI / 2);
      context.beginPath();
      context.moveTo(0, -11 * s);
      context.lineTo(8 * s, 6 * s);
      context.lineTo(-8 * s, 6 * s);
      context.closePath();
      context.fill();
      context.rotate(-(angle + Math.PI / 2));
      context.translate(-x, -y);
    }
    context.shadowBlur = 0;
    label(`GATE ${guide.index + 1}`, x, y - 23 * s, 10 * s, onScreen ? CYAN : AMBER, 'center');
    mono(distance, x, y + 32 * s, 11 * s, onScreen ? INK : AMBER, 'center', 600);
    context.restore();
  }

  function drawWarnings(state, time) {
    const s = Math.min(width / 1280, height / 800);
    const messages = [];
    if (state.stall) messages.push({ text: 'STALL', color: RED });
    if (state.clearance > 0 && state.clearance < 48 && state.verticalSpeed < 4) messages.push({ text: 'TERRAIN', color: AMBER });
    if (state.brake) messages.push({ text: 'AIRBRAKE', color: GOLD });
    if (messages.length === 0) return;
    const blink = Math.sin(time * 10) > -0.25;
    if (!blink) return;
    context.save();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `700 ${15 * s}px ${MONO}`;
    messages.forEach((message, index) => {
      context.shadowColor = message.color;
      context.shadowBlur = 12;
      context.fillStyle = message.color;
      context.fillText(message.text, width / 2, height * 0.46 + (74 + index * 24) * s);
    });
    context.restore();
  }

  function gaugeFace(cx, cy, r, color) {
    context.save();
    context.beginPath();
    context.arc(cx, cy, r + 5, 0, Math.PI * 2);
    context.fillStyle = '#20313a';
    context.fill();
    context.strokeStyle = 'rgba(185,208,216,0.4)';
    context.lineWidth = 1;
    context.stroke();
    const face = context.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
    face.addColorStop(0, '#12313c');
    face.addColorStop(0.7, '#081c24');
    face.addColorStop(1, '#041116');
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.fillStyle = face;
    context.fill();
    context.strokeStyle = 'rgba(126,241,255,0.14)';
    context.stroke();

    const start = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    context.strokeStyle = 'rgba(198,224,232,0.55)';
    context.lineWidth = 1;
    for (let index = 0; index <= 24; index += 1) {
      const angle = start + (index / 24) * sweep;
      const inner = index % 6 === 0 ? r - 8 * (r / 32) : r - 4 * (r / 32);
      context.beginPath();
      context.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      context.lineTo(cx + Math.cos(angle) * (r - 1), cy + Math.sin(angle) * (r - 1));
      context.stroke();
    }
    context.strokeStyle = 'rgba(126,241,255,0.18)';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(cx, cy, r - 6, start, start + sweep);
    context.stroke();
    context.strokeStyle = 'rgba(255,255,255,0.09)';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(cx, cy, r - 10, Math.PI * 1.08, Math.PI * 1.72);
    context.stroke();
    context.restore();
    return { start, sweep, color };
  }

  function drawStandardGauge(cx, cy, r, value, unit, fraction, color, caption) {
    gaugeFace(cx, cy, r, color);
    const start = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    const active = start + sweep * clamp(fraction, 0, 1);
    context.save();
    context.strokeStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 10;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(cx, cy, r - 6, start, active);
    context.stroke();
    const angle = active;
    context.strokeStyle = '#ecfbff';
    context.lineWidth = 1.7;
    context.shadowBlur = 6;
    context.beginPath();
    context.moveTo(cx + Math.cos(angle) * (r * 0.22), cy + Math.sin(angle) * (r * 0.22));
    context.lineTo(cx + Math.cos(angle) * (r - 11), cy + Math.sin(angle) * (r - 11));
    context.stroke();
    context.fillStyle = color;
    context.shadowBlur = 10;
    context.beginPath();
    context.arc(cx, cy, 2.1, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.save();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `600 ${12 * (r / 30)}px ${MONO}`;
    context.fillStyle = '#eaf8ff';
    context.shadowColor = color;
    context.shadowBlur = 5;
    context.fillText(String(value), cx, cy + r * 0.42);
    context.shadowBlur = 0;
    context.font = `500 ${6.5 * (r / 30)}px ${SANS}`;
    context.fillStyle = 'rgba(143,179,193,0.8)';
    context.fillText(unit, cx, cy + r * 0.62);
    label(caption, cx, cy + r + 14 * (r / 30), 7.5 * (r / 30), color, 'center');
    context.restore();
    // Glass glint.
    context.save();
    const glint = context.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    glint.addColorStop(0, 'rgba(255,255,255,0.13)');
    glint.addColorStop(0.4, 'rgba(255,255,255,0.015)');
    glint.addColorStop(1, 'rgba(255,255,255,0)');
    context.beginPath();
    context.arc(cx, cy, r - 1, 0, Math.PI * 2);
    context.fillStyle = glint;
    context.fill();
    context.restore();
  }

  function drawHeadingGauge(cx, cy, r, heading, caption) {
    const color = MINT;
    gaugeFace(cx, cy, r, color);
    const radians = (-heading * Math.PI) / 180;
    context.save();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `600 ${8 * (r / 30)}px ${SANS}`;
    for (const [bearing, text] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
      const angle = -Math.PI / 2 + radians + (bearing * Math.PI) / 180;
      const x = cx + Math.cos(angle) * r * 0.7;
      const y = cy + Math.sin(angle) * r * 0.7;
      context.fillStyle = text === 'N' ? color : 'rgba(200,230,236,0.6)';
      context.fillText(text, x, y);
    }
    context.strokeStyle = 'rgba(141,247,208,0.7)';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    context.save();
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 8;
    context.beginPath();
    context.moveTo(cx, cy - r * 0.83);
    context.lineTo(cx - 4, cy - r * 0.7);
    context.lineTo(cx + 4, cy - r * 0.7);
    context.closePath();
    context.fill();
    context.restore();
    context.save();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `600 ${13 * (r / 30)}px ${MONO}`;
    context.fillStyle = '#eaf8ff';
    context.shadowColor = color;
    context.shadowBlur = 7;
    context.fillText(`${String(Math.round(heading) % 360).padStart(3, '0')}°`, cx, cy + r * 0.4);
    context.restore();
    label(caption, cx, cy + r + 14 * (r / 30), 7.5 * (r / 30), color, 'center');
  }

  function drawAttitudeGauge(cx, cy, r, state) {
    const color = CYAN;
    context.save();
    context.beginPath();
    context.arc(cx, cy, r + 5, 0, Math.PI * 2);
    context.fillStyle = '#20313a';
    context.fill();
    context.strokeStyle = 'rgba(185,208,216,0.4)';
    context.lineWidth = 1;
    context.stroke();
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.clip();
    context.save();
    context.translate(cx, cy);
    context.rotate(state.bank * 0.9);
    context.translate(0, state.pitchDeg * 1.25);
    context.fillStyle = '#3c7ba4';
    context.fillRect(-r * 2, -r * 4, r * 4, r * 4);
    context.fillStyle = '#6c5639';
    context.fillRect(-r * 2, 0, r * 4, r * 4);
    context.strokeStyle = 'rgba(235,250,255,0.9)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(-r * 2, 0);
    context.lineTo(r * 2, 0);
    context.stroke();
    context.strokeStyle = 'rgba(235,250,255,0.5)';
    for (const offset of [-12, 12, -24, 24]) {
      const y = offset * (r / 30) * -1;
      context.beginPath();
      context.moveTo(-r * (offset % 24 === 0 ? 0.28 : 0.18), y);
      context.lineTo(r * (offset % 24 === 0 ? 0.28 : 0.18), y);
      context.stroke();
    }
    context.restore();
    context.restore();
    context.save();
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.shadowColor = color;
    context.shadowBlur = 7;
    context.beginPath();
    context.moveTo(cx - 14, cy);
    context.lineTo(cx - 5, cy);
    context.moveTo(cx + 5, cy);
    context.lineTo(cx + 14, cy);
    context.moveTo(cx, cy - 3);
    context.lineTo(cx, cy + 3);
    context.stroke();
    context.restore();
    label('ATTITUDE', cx, cy + r + 14 * (r / 30), 7.5 * (r / 30), color, 'center');
  }

  function drawPanel(state, view) {
    const s = Math.min(width / 1280, height / 800);
    const cockpit = view === 'cockpit';
    const panelW = (cockpit ? 804 : 646) * s;
    const panelH = (cockpit ? 136 : 116) * s;
    const panelX = (width - panelW) / 2;
    const panelY = height - panelH - (cockpit ? 16 : 18) * s;
    context.save();
    notchedPath(context, panelX, panelY, panelW, panelH, 15 * s);
    const gradient = context.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
    gradient.addColorStop(0, 'rgba(12,25,31,0.92)');
    gradient.addColorStop(0.12, 'rgba(5,14,19,0.93)');
    gradient.addColorStop(1, 'rgba(2,7,10,0.95)');
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = 'rgba(126,241,255,0.25)';
    context.lineWidth = 1;
    context.stroke();
    context.strokeStyle = 'rgba(255,180,92,0.65)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(panelX + 18 * s, panelY + 1);
    context.lineTo(panelX + panelW * 0.36, panelY + 1);
    context.stroke();
    context.strokeStyle = 'rgba(126,241,255,0.5)';
    context.beginPath();
    context.moveTo(panelX + panelW * 0.65, panelY + 1);
    context.lineTo(panelX + panelW - 18 * s, panelY + 1);
    context.stroke();
    label(cockpit ? 'KESTREL KR-7 · PRIMARY FLIGHT DISPLAY' : 'KESTREL KR-7 · INSTRUMENT CLUSTER', panelX + 16 * s, panelY + 14 * s, 7.5, 'rgba(143,179,193,0.85)');
    label('SKYREEF RUN', panelX + panelW - 16 * s, panelY + 14 * s, 7.5, 'rgba(143,179,193,0.55)', 'right');

    // Screws.
    for (const [sx, sy] of [[panelX + 8 * s, panelY + 8 * s], [panelX + panelW - 8 * s, panelY + 8 * s], [panelX + 8 * s, panelY + panelH - 8 * s], [panelX + panelW - 8 * s, panelY + panelH - 8 * s]]) {
      context.beginPath();
      context.arc(sx, sy, 1.6 * s, 0, Math.PI * 2);
      context.fillStyle = 'rgba(190,210,216,0.35)';
      context.fill();
    }

    const count = cockpit ? 6 : 4;
    const radius = (cockpit ? 33 : 33) * s;
    const cy = panelY + panelH * 0.55;
    const speedKt = Math.round(state.speed * 1.94384);
    const altitudeFt = Math.round(state.altitude * 3.28084);
    const vsFpm = Math.round(state.verticalSpeed * 196.85);
    for (let index = 0; index < count; index += 1) {
      const cx = panelX + (panelW * (index + 0.5)) / count;
      if (cockpit) {
        if (index === 0) drawStandardGauge(cx, cy, radius, speedKt, 'KT', speedKt / 430, CYAN, 'AIRSPEED');
        else if (index === 1) drawAttitudeGauge(cx, cy, radius, state);
        else if (index === 2) drawStandardGauge(cx, cy, radius, altitudeFt, 'FT', altitudeFt / 5200, AMBER, 'ALTITUDE');
        else if (index === 3) drawHeadingGauge(cx, cy, radius, state.heading, 'HEADING');
        else if (index === 4) drawStandardGauge(cx, cy, radius, `${Math.round(state.throttle * 100)}%`, 'POWER', state.throttle, GOLD, 'THROTTLE');
        else {
          const vsFraction = clamp((vsFpm + 2000) / 4000, 0, 1);
          drawStandardGauge(cx, cy, radius, `${vsFpm >= 0 ? '+' : ''}${vsFpm}`, 'FPM', vsFraction, MINT, 'VERT SPEED');
        }
      } else {
        if (index === 0) drawStandardGauge(cx, cy, radius, speedKt, 'KT', speedKt / 430, CYAN, 'AIRSPEED');
        else if (index === 1) drawStandardGauge(cx, cy, radius, altitudeFt, 'FT', altitudeFt / 5200, AMBER, 'ALTITUDE');
        else if (index === 2) drawHeadingGauge(cx, cy, radius, state.heading, 'HEADING');
        else drawStandardGauge(cx, cy, radius, `${Math.round(state.throttle * 100)}%`, 'POWER', state.throttle, GOLD, 'THROTTLE');
      }
    }
    context.restore();
  }

  function drawBottomLabels(state, view, muted) {
    const s = Math.min(width / 1280, height / 800);
    context.save();
    context.textBaseline = 'alphabetic';
    label(view === 'cockpit' ? 'C  CHASE VIEW' : 'C  COCKPIT VIEW', 24 * s, height - 54 * s, 8.5, 'rgba(180,211,222,0.7)');
    label('W/S  THROTTLE', 24 * s, height - 40 * s, 8.5, 'rgba(180,211,222,0.5)');
    label('P  PAUSE', 24 * s, height - 26 * s, 8.5, 'rgba(180,211,222,0.5)');
    label('KESTREL KR-7 · TERN', width - 24 * s, height - 40 * s, 8.5, 'rgba(180,211,222,0.7)', 'right');
    label(muted ? 'SOUND OFF' : 'AUDIO ON', width - 24 * s, height - 26 * s, 8.5, muted ? RED : 'rgba(141,247,208,0.65)', 'right');
    context.restore();
  }

  function drawNotice(notice) {
    if (!notice || notice.life <= 0) return;
    const s = Math.min(width / 1280, height / 800);
    const alpha = Math.min(1, notice.life * 2.4);
    context.save();
    context.globalAlpha = alpha;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `700 ${21 * s}px ${SANS}`;
    context.letterSpacing = `${2.5 * s}px`;
    context.shadowColor = notice.color || CYAN;
    context.shadowBlur = 18;
    context.fillStyle = notice.color || CYAN;
    context.fillText(notice.text, width / 2, height * 0.29);
    if (notice.detail) {
      context.shadowBlur = 0;
      context.font = `500 ${10 * s}px ${SANS}`;
      context.fillStyle = 'rgba(215,238,244,0.78)';
      context.fillText(notice.detail, width / 2, height * 0.29 + 24 * s);
    }
    context.restore();
  }

  function drawCockpitGlass(view, time) {
    if (view !== 'cockpit') return;
    const s = Math.min(width / 1280, height / 800);
    context.save();
    const top = context.createLinearGradient(0, 0, 0, 150 * s);
    top.addColorStop(0, 'rgba(2,8,11,0.46)');
    top.addColorStop(1, 'rgba(2,8,11,0)');
    context.fillStyle = top;
    context.fillRect(0, 0, width, 150 * s);
    const side = context.createLinearGradient(0, height * 0.45, 120 * s, height * 0.55);
    side.addColorStop(0, 'rgba(2,8,11,0.24)');
    side.addColorStop(1, 'rgba(2,8,11,0)');
    context.fillStyle = side;
    context.fillRect(0, height * 0.35, 120 * s, height * 0.55);
    const sheen = context.createLinearGradient(width * 0.15, 0, width * 0.7, height * 0.38);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.5, 'rgba(208,245,255,0.035)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = sheen;
    context.fillRect(0, 0, width, height * 0.44);
    context.restore();
  }

  function draw({ state, view, guide, notice, time, muted }) {
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    drawCockpitGlass(view, time);
    drawTop(state, guide, time, view);
    drawPitchLadder(state, time);
    drawReticle(state, time);
    drawGuide(guide, state, time);
    drawWarnings(state, time);
    drawNotice(notice);
    drawPanel(state, view);
    drawBottomLabels(state, view, muted);
  }

  function clear() {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { draw, clear, resize };
}
