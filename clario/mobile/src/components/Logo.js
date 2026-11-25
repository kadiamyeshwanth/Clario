/** The Clario pinwheel mark — same path as web/public/clario.svg. */
import React from 'react';
import Svg, { Path } from 'react-native-svg';

export default function Logo({ size = 30, color = '#E85002' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" accessibilityLabel="Clario">
      <Path
        d="M 228 0 C 172.772 0 128 44.772 128 100 L 128 0 L 0 0 L 0 28 C 0 83.228 44.772 128 100 128 L 0 128 L 0 256 L 28 256 C 83.228 256 128 211.228 128 156 L 128 256 L 256 256 L 256 228 C 256 172.772 211.228 128 156 128 L 256 128 L 256 0 Z"
        fill={color}
      />
    </Svg>
  );
}
