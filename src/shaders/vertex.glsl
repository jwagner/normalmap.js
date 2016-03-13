attribute vec3 aPosition;

uniform float uScale;
uniform float uTextureAspect;

varying vec2 vUv;
varying vec3 vPosition;

void main(){
    vPosition = vec3(vec2(0.5)-(aPosition.xy)*vec2(-0.5, 0.5), 0);
    vUv = vPosition.xy * uScale * vec2(1.0, 1.0/uTextureAspect);
    gl_Position = vec4(aPosition, 1.0);
}
