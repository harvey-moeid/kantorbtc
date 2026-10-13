import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Vector2, HalfFloatType, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/** Keep the heavier finish on High; automatic quality can drop it immediately. */
export default function OfficeEffects() {
  const { gl, scene, camera, size, invalidate } = useThree();
  const pipeline = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      samples: 4,
    });
    const composer = new EffectComposer(gl, target);
    composer.setPixelRatio(1);
    const ao = new SSAOPass(scene, camera, 1, 1);
    ao.kernelRadius = 10;
    ao.minDistance = 0.001;
    ao.maxDistance = 0.14;
    const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.18, 0.35, 1.6);
    const output = new OutputPass();
    const beauty = new RenderPass(scene, camera);
    composer.addPass(beauty);
    composer.addPass(ao);
    composer.addPass(bloom);
    composer.addPass(output);
    return { composer, passes: [beauty, ao, bloom, output] };
  }, [gl, scene, camera]);
  useEffect(() => {
    pipeline.composer.setSize(size.width, size.height);
    invalidate();
  }, [pipeline, size.width, size.height, invalidate]);
  useEffect(
    () => () => {
      pipeline.passes.forEach((pass) => pass.dispose());
      pipeline.composer.dispose();
    },
    [pipeline],
  );
  useFrame((_, delta) => pipeline.composer.render(delta), 1);
  return null;
}
