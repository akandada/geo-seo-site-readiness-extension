import { grade, scoreColor } from "./formatters.js";

export function renderOverallGauge(canvas, score) {
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var dpr = window.devicePixelRatio || 1;
  var parent = canvas.parentNode;
  var size = parent && parent.clientWidth ? parent.clientWidth : 260;
  if (size < 200) size = 200;
  var padding = 18;
  var radius = (size / 2) - padding;
  if (radius < 54) radius = 54;
  var center = size / 2;

  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + "px";
  canvas.style.height = size + "px";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);

  var clamped = Number(score);
  if (clamped !== clamped) clamped = 0;
  if (clamped < 0) clamped = 0;
  if (clamped > 100) clamped = 100;

  var start = -Math.PI / 2;
  var end = start + (Math.PI * 2 * (clamped / 100));
  var trackWidth = Math.max(radius * 0.2, 16);

  ctx.lineCap = "round";
  ctx.lineWidth = trackWidth;

  ctx.beginPath();
  ctx.strokeStyle = "rgba(92,162,255,0.18)";
  ctx.arc(center, center, radius - trackWidth / 2, 0, Math.PI * 2, false);
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = scoreColor(clamped);
  ctx.arc(center, center, radius - trackWidth / 2, start, end, false);
  ctx.stroke();

  ctx.fillStyle = "#e6eef6";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "28px 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  ctx.fillText(Math.round(clamped), center, center - 6);

  ctx.font = "16px 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  ctx.fillStyle = "rgba(230,238,246,0.75)";
  ctx.fillText("Grade " + grade(clamped), center, center + 18);
}

export function renderFindingBreakdown(canvas, data) {
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var dpr = window.devicePixelRatio || 1;
  var parent = canvas.parentNode;
  var width = parent && parent.clientWidth ? parent.clientWidth : 340;
  var height = width * 0.6;
  if (height < 180) height = 180;
  var radius = Math.min(width, height) / 2 - 20;
  if (radius < 60) radius = 60;
  var centerX = width / 2;
  var centerY = Math.min(height / 2 + 12, height - radius - 12);

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);

  var total = 0;
  for (var i = 0; i < data.length; i++) {
    var v = data[i] && data[i].value != null ? Number(data[i].value) : 0;
    if (v === v && v > 0) total += v;
  }
  if (!total) {
    return;
  }

  var currentAngle = -Math.PI / 2;
  for (var j = 0; j < data.length; j++) {
    var item = data[j];
    var val = item && item.value != null ? Number(item.value) : 0;
    if (!(val > 0)) {
      continue;
    }
    var portion = val / total;
    var endAngle = currentAngle + portion * Math.PI * 2;
    ctx.beginPath();
    ctx.fillStyle = item.color || "#5ca2ff";
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, endAngle);
    ctx.closePath();
    ctx.fill();
    currentAngle = endAngle;
  }

  ctx.beginPath();
  ctx.fillStyle = "#121821";
  ctx.arc(centerX, centerY, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e6eef6";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "18px 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  ctx.fillText(total + " findings", centerX, centerY);
}

export function renderScoreChart(canvas, categories) {
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var dpr = window.devicePixelRatio || 1;
  var parent = canvas.parentNode;
  var width = parent && parent.clientWidth ? parent.clientWidth : 360;
  var paddingX = 20;
  var paddingY = 18;
  var barHeight = 24;
  var gap = 14;
  var labelWidth = 140;
  var count = categories ? categories.length : 0;
  var height = paddingY * 2 + (count > 0 ? (count * barHeight + (count - 1) * gap) : 0);

  if (width <= 0) { width = 600; }
  if (height <= 0) { height = paddingY * 2 + barHeight; }

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);

  if (!count) {
    return;
  }

  var font = "13px 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  var trackColor = "rgba(92,162,255,0.14)";
  var textColor = "#e6eef6";

  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(0, 0, width, height);

  for (var i = 0; i < count; i++) {
    var item = categories[i];
    var score = item.score;
    if (score == null || score !== score) score = 0;
    if (score < 0) score = 0;
    if (score > 100) score = 100;

    var y = paddingY + i * (barHeight + gap);
    var barX = paddingX + labelWidth;
    var maxWidth = width - paddingX - barX;
    if (maxWidth < 60) maxWidth = 60;
    var filledWidth = maxWidth * (score / 100);

    ctx.fillStyle = trackColor;
    ctx.fillRect(barX, y, maxWidth, barHeight);

    ctx.fillStyle = scoreColor(score);
    ctx.fillRect(barX, y, filledWidth, barHeight);

    ctx.fillStyle = textColor;
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(item.title, paddingX, y + barHeight / 2);

    ctx.textAlign = "right";
    var scoreLabel = Math.round(score) + " (" + grade(score) + ")";
    ctx.fillText(scoreLabel, barX + maxWidth, y + barHeight / 2);
  }
}
