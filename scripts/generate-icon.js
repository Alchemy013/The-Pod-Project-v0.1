const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const S = 1024;
const canvas = createCanvas(S, S);
const g = canvas.getContext('2d');

const scale = S / 512;
g.scale(scale, scale);

const W = 512, H = 512;
const cx = W / 2, cy = H / 2;

// Black background
g.fillStyle = '#000';
g.fillRect(0, 0, W, H);

// Pod — filled white capsule
const pw = 200, ph = 370;
const pr = pw / 2;
const px = cx - pw / 2;
const py = cy - ph / 2 - 6;

g.fillStyle = '#ffffff';
g.beginPath();
g.arc(cx, py + pr, pr, Math.PI, 0);
g.lineTo(px + pw, py + ph - pr);
g.arc(cx, py + ph - pr, pr, 0, Math.PI);
g.closePath();
g.fill();

// Text — black, inside pod
const bodyCy = py + ph / 2;
g.fillStyle = '#000';
g.textAlign = 'center';

g.font = '300 54px -apple-system, "Helvetica Neue", Arial, sans-serif';
g.textBaseline = 'middle';
g.fillText('The', cx, bodyCy - 42);

g.font = '700 82px -apple-system, "Helvetica Neue", Arial, sans-serif';
g.textBaseline = 'middle';
g.fillText('Pod', cx, bodyCy + 38);

const out = path.join(__dirname, '../assets/images/icon.png');
fs.writeFileSync(out, canvas.toBuffer('image/png'));
console.log('icon written to', out);
