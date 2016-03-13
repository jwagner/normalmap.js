precision highp float;
#include "common.glsl"
#include "fxaa.glsl"

uniform sampler2D uFrameBufferSampler;
uniform vec2 uFrameBufferResolution;

varying vec3 vPosition;

#ifdef USE_AMBIENT_MAP
varying vec2 vUv;
#endif

#include "ambient.glsl"

void main(){
#ifdef USE_FXAA
    // fxaa does gammaEncode .. for now
    vec4 frameBuffer = fxaa(vec2(vPosition.x, 1.0 - vPosition.y), uFrameBufferResolution, uFrameBufferSampler);
#endif
#ifndef USE_FXAA
    vec4 frameBuffer = gammaEncode(texture2D(uFrameBufferSampler, vec2(vPosition.x, 1.0 - vPosition.y)));
#endif
    gl_FragColor = frameBuffer;
// assume SRGB
#ifdef USE_AMBIENT_MAP
   addAmbient(gl_FragColor);
#endif
}
