attribute vec3 aPosition;
#ifdef USE_AMBIENT_MAP
varying vec2 vUv;
#endif

void main(){
    vUv = vec2(0.5)-(aPosition.xy)*vec2(-0.5, 0.5);
    gl_Position = vec4(aPosition, 1.0);
}
