#include "common.glsl"

// Epic approximation of schlicks
// F0 is the specular reflectance at normal incidence.
// via: http://blog.selfshadow.com/publications/s2013-shading-course/karis/s2013_pbs_epic_notes_v2.pdf
vec3 F_schlick( vec3 F0, float dotLH ) {
	float fresnel = exp2( ( -5.55473 * dotLH - 6.98316 ) * dotLH );
	return ( 1.0 - F0 ) * fresnel + F0;
}

// normal distribution
// alpha = roughness^2
// via: http://blog.selfshadow.com/publications/s2013-shading-course/karis/s2013_pbs_epic_notes_v2.pdf
float D_ggx(const in float dotNH, const in float alpha) {
    float alphaSquared = alpha * alpha;
    float denominator = dotNH*dotNH * (alphaSquared - 1.0) + 1.0;
    return (alphaSquared) / (PI * denominator*denominator);
}

// geometric attenuation
// http://blog.selfshadow.com/publications/s2013-shading-course/karis/s2013_pbs_epic_notes_v2.pdf
float G_ggx(const in float dotNL, const in float dotNV, const in float roughness) {
    float k = (roughness + 1.0);
    k = k*k / 8.0;
    float l = dotNL / ( dotNL * (1.0-k) + k);
    float v = dotNV / ( dotNV * (1.0-k) + k);
    return l * v;
}

// n = normal
// l = light direction
// v = view direction
// F0 specular color
// h = half angle between l and v
vec3 brdf_ggx(vec3 n, vec3 l, vec3 v, vec3 F0, float roughness) {
    float alpha = roughness * roughness;
    vec3 h = normalize(l + v);

    float dotNL = saturate(dot(n, l));
    float dotNV = saturate(dot(n, v));
    float dotNH = saturate(dot(n, h));
    float dotLH = saturate(dot(l, h));

    vec3 F = F_schlick(F0, dotLH);
    float D = D_ggx(dotNH, alpha);
    float G = G_ggx(dotNL, dotNV, roughness);

    return F * ( G * D );
}
