#ifdef USE_AMBIENT_MAP
uniform sampler2D uAmbientSampler;
uniform float uAmbient;

void addAmbient(inout vec4 fragColor){
    vec4 ambient = texture2D(uAmbientSampler, vUv);
    ambient.rgb *= uAmbient * ambient.a;
    fragColor.rgb = fragColor.rgb*fragColor.a + ambient.rgb;
    // this is a bit of a hack but it allows for a separate alpha in both
    // while not messing up when they are blended
    fragColor.a = max(fragColor.a, ambient.a);
}
#endif
