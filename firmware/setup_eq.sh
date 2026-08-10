#!/bin/bash
# One-time EQ setup for ThePod — run once on the Pi while it has internet
set -e

echo "[EQ] Installing alsaequal..."
sudo apt-get update -qq && sudo apt-get install -y libasound2-plugin-equal

echo "[EQ] Writing /etc/asound.conf..."
# Address the DAC by CARD NAME, never by index. A hardcoded "plughw:1,0" here is
# what broke all playback on 2026-08-10: removing the vc4-kms-v3d overlay took
# away the HDMI audio card, every remaining card shifted down one, and ALSA
# failed with "Cannot get card index for 1". The name is stable across that.
sudo tee /etc/asound.conf > /dev/null <<'EOF'
ctl.equal {
    type equal;
    controls "/var/lib/mpd/.alsaequal.bin";
}

pcm.plugequal {
    type equal;
    slave.pcm "plughw:CARD=IQaudIODAC,DEV=0";
    controls "/var/lib/mpd/.alsaequal.bin";
}

pcm.equal {
    type plug;
    slave.pcm plugequal;
}
EOF

echo "[EQ] Patching MPD to use equal device..."
sudo sed -i 's/device "hw:[0-9]*,0"/device "equal"/' /etc/mpd.conf

echo "[EQ] Switching MPD to the PCM5122's hardware mixer..."
# Software mixing scales samples, which costs bit depth at every step below
# 100% — on a bit-perfect player. The PCM5122 has its own Digital control
# (0-207, dB-mapped), so let the DAC do the attenuation. mixer_device must name
# the real card: ctl.equal is the equaliser control and carries no volume.
sudo sed -i 's/    mixer_type  "software"/    mixer_type  "hardware"\n    mixer_device "hw:CARD=IQaudIODAC"\n    mixer_control "Digital"/' /etc/mpd.conf

echo "[EQ] Restarting MPD and ThePod..."
sudo systemctl restart mpd
sleep 2
sudo systemctl restart thepod

echo "[EQ] Done. Run 'amixer -D equal' to verify EQ controls are present."
