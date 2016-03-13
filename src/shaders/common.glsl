#define saturate(x) clamp(x, 0.0, 1.0)
const float PI = 3.14159265359;
const float RECIPROCAL_PI = 1.0 / PI;
const float EPSILON = 1e-30;

float gammaEncode(const in float linear){
    return pow(linear, 1.0/2.2);
}
vec3 gammaEncode(const in vec3 linear) {
    return pow(linear, vec3(1.0/2.2));
}
vec4 gammaEncode(const in vec4 linear) {
    return vec4(pow(linear.rgb, vec3(1.0/2.2)), linear.a);
}

vec3 gammaDecode(const in vec3 linear) {
    return pow(linear, vec3(2.2));
}
