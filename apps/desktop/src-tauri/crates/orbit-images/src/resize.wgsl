struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var image_sampler: sampler;

@vertex fn vs(@builtin(vertex_index) index: u32) -> Vertex {
    let positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
    let p = positions[index];
    return Vertex(vec4f(p, 0.0, 1.0), vec2f((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5));
}

@fragment fn fs(in: Vertex) -> @location(0) vec4f {
    let footprint = vec2f(abs(dpdx(in.uv.x)), abs(dpdy(in.uv.y)));
    var sum = vec4f(0.0);
    for (var y = 0; y < 4; y += 1) {
        for (var x = 0; x < 4; x += 1) {
            let offset = (vec2f(f32(x), f32(y)) / 4.0 - vec2f(0.375)) * footprint;
            let color = textureSampleLevel(source, image_sampler, in.uv + offset, 0.0);
            sum += vec4f(color.rgb * color.a, color.a);
        }
    }
    let average = sum / 16.0;
    return vec4f(average.rgb / max(average.a, 0.00001), average.a);
}
