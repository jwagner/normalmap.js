precision highp float;
#include "common.glsl"
#include "brdf.glsl"

uniform sampler2D uNormalSampler;

#ifdef USE_BASE_COLOR_MAP
uniform sampler2D uBaseColorSampler;
#endif

#ifdef USE_MATERIAL_MAP
uniform sampler2D uMaterialSampler;
#endif

uniform vec3 uBaseColor;
uniform float uMetalness;
uniform float uRoughness;

#ifdef IS_POINT_LIGHT
uniform vec3 uLightPosition;
#endif

#ifdef USE_SSS
uniform float uSubSurfaceScattering;
#endif

#ifdef IS_DIRECTIONAL_LIGHT
uniform vec3 uLightDirection;
#endif

uniform vec3 uLightColor;
uniform float uViewportAspect;
uniform float uScale;

varying vec2 vUv;
varying vec3 vPosition;

#ifdef USE_SINGLE_PASS
#include "ambient.glsl"
#endif

const vec3 eye = vec3(0.5, 0.5, 100.0);

float attenuation(float distance){
    return  1.0/(distance*distance);
}

vec3 rgbToNormal(vec3 rgb){
    return normalize(rgb - vec3(0.5));
}

void main(){
    vec4 normalSample = texture2D(uNormalSampler, vUv);
    float alpha = normalSample.a;
    vec3 normal = rgbToNormal(normalSample.rgb);
#ifdef USE_SSS
    vec4 diffuseNormalSample = texture2D(uNormalSampler, vUv, uSubSurfaceScattering);
    vec3 diffuseNormal = rgbToNormal(diffuseNormalSample.rgb);
#else
#define diffuseNormal normal
#endif

    float metalness = uMetalness;
    float roughness = uRoughness;

#ifdef USE_MATERIAL_MAP
    vec4 materialSample = texture2D(uMaterialSampler, vUv);
    metalness *= materialSample.r;
    roughness *= materialSample.g;
    float occlusion = materialSample.b;
#endif

    metalness = saturate(metalness);
    roughness = clamp(roughness, EPSILON, 1.0);

    vec3 baseColor = uBaseColor;

#ifdef USE_BASE_COLOR_MAP
    vec4 baseColorSample = texture2D(uBaseColorSampler, vUv);
    baseColor *= gammaDecode(baseColorSample.rgb);
#endif

    vec3 diffuseColor = mix(baseColor, vec3(0.0), metalness);
    // ?
    vec3 specularColor = mix(vec3(0.04), baseColor.rgb, metalness)*0.5;

#ifdef IS_POINT_LIGHT
    vec3 lightOffset = vPosition - uLightPosition;
    lightOffset.y /= uViewportAspect;
    float lightDistance = length(lightOffset);
    float falloff = attenuation(lightDistance);
    vec3 lightDirection = lightOffset/lightDistance;
#endif

#ifdef IS_DIRECTIONAL_LIGHT
    float falloff = 1.0;
    vec3 lightDirection = uLightDirection;
#endif

    vec3 eyeDirection = normalize(eye - vPosition);
    vec3 diffuse = max(0.0, -dot(diffuseNormal, lightDirection))*diffuseColor;
    // linear = vec3(roughness);
    vec3 specular = brdf_ggx(normal, -lightDirection, eyeDirection, specularColor, roughness);
    vec3 intensity = (diffuse+specular)*falloff;

#ifdef USE_MATERIAL_MAP
    intensity *= occlusion;
#endif

    vec3 linear = uLightColor*intensity;
    // linear = specularColor;
    // linear.r = metalness;
    // linear = vec3(uRoughness*materialSample.g == materialSample.g ? 1.0 : 0.0);
    // linear.b = occlusion;

    gl_FragColor = vec4(linear, alpha);

#ifdef USE_SINGLE_PASS
    gl_FragColor = gammaEncode(gl_FragColor);
#ifdef USE_AMBIENT_MAP
   addAmbient(gl_FragColor);
#endif
#endif

}
