import { describe, expect, it } from "vitest";
import {
  compareFaceGeometry,
  evaluateFaceGeometryQuality,
  type FaceLandmark,
} from "./faceGeometry";

function syntheticFace(): FaceLandmark[] {
  const points: FaceLandmark[] = Array.from({ length: 478 }, (_, i) => {
    const a = (i / 478) * Math.PI * 2;
    const ring = 0.72 + ((i * 37) % 29) / 100;
    return {
      x: 0.5 + Math.cos(a) * 0.18 * ring,
      y: 0.5 + Math.sin(a) * 0.24 * ring,
      z: Math.sin(a * 2.3) * 0.025 + ((i % 11) - 5) * 0.0007,
    };
  });

  // Âncoras anatômicas importantes usadas pelo algoritmo.
  const set = (i:number,x:number,y:number,z=0) => { points[i] = {x,y,z}; };
  set(33,.38,.43,-.01); set(133,.45,.43,-.005);
  set(362,.55,.43,-.005); set(263,.62,.43,-.01);
  set(1,.50,.54,-.055); set(2,.50,.59,-.045); set(168,.50,.46,-.035);
  set(98,.46,.57,-.035); set(327,.54,.57,-.035);
  set(61,.43,.66,-.015); set(291,.57,.66,-.015);
  set(13,.50,.655,-.02); set(14,.50,.675,-.02);
  set(10,.50,.25,.01); set(152,.50,.82,.015);
  set(234,.30,.53,.015); set(454,.70,.53,.015);
  set(127,.32,.42,.005); set(356,.68,.42,.005);
  set(172,.35,.73,.01); set(397,.65,.73,.01);
  set(58,.37,.69,.005); set(288,.63,.69,.005);
  set(93,.34,.62,.005); set(323,.66,.62,.005);
  set(70,.39,.36,.002); set(107,.46,.37,0);
  set(336,.54,.37,0); set(300,.61,.36,.002);
  [468,469,470,471,472].forEach((i,k)=>set(i,.415+Math.cos(k*1.256)*.008,.43+Math.sin(k*1.256)*.008,-.02));
  [473,474,475,476,477].forEach((i,k)=>set(i,.585+Math.cos(k*1.256)*.008,.43+Math.sin(k*1.256)*.008,-.02));
  return points;
}

function transform(points: FaceLandmark[], scale:number, angle:number, tx:number, ty:number, tz=0) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return points.map(p => ({
    x: (p.x*c - p.y*s)*scale + tx,
    y: (p.x*s + p.y*c)*scale + ty,
    z: p.z*scale + tz,
  }));
}

describe("face geometry engine", () => {
  it("gives virtually identical geometry for the same landmarks", () => {
    const face = syntheticFace();
    const score = compareFaceGeometry(face, face);
    expect(score.similarity).toBeGreaterThan(99.5);
    expect(score.rmsError).toBeLessThan(0.001);
  });

  it("is robust to rigid translation, scale and rotation", () => {
    const face = syntheticFace();
    const changed = transform(face, 1.37, 0.31, -.18, .22, .04);
    const score = compareFaceGeometry(face, changed);
    expect(score.similarity).toBeGreaterThan(98);
  });

  it("penalizes a real local deformation in nose and jaw", () => {
    const face = syntheticFace();
    const deformed = face.map(p => ({...p}));
    for (const i of [1,2,4,5,6,19,20,45,48,64,94,98,115,168,195,197,220,275,278,294,327,344,440]) {
      deformed[i].x += (deformed[i].x < .5 ? -.055 : .055);
      deformed[i].y += .018;
    }
    for (const i of [234,127,162,21,54,103,67,109,454,356,389,251,284,332,297,338]) {
      deformed[i].x += deformed[i].x < .5 ? -.045 : .045;
    }
    const score = compareFaceGeometry(face, deformed);
    expect(score.similarity).toBeLessThan(94);
    expect(score.regions.nose).toBeLessThan(94);
  });

  it("does not let mouth expression dominate the identity geometry score", () => {
    const face = syntheticFace();
    const smile = face.map(p => ({...p}));
    for (const i of [61,146,91,181,84,17,314,405,321,375,291,308,324,318,402,317,14,87,178,88,95,78]) {
      smile[i].y += i % 2 ? -.035 : .035;
    }
    const score = compareFaceGeometry(face, smile);
    expect(score.similarity).toBeGreaterThan(92);
  });

  it("flags strong roll as lower geometry quality", () => {
    const face = syntheticFace();
    const rolled = transform(face, 1, .42, 0, 0);
    const quality = evaluateFaceGeometryQuality(rolled);
    expect(quality.score).toBeLessThan(100);
    expect(quality.warnings.some(w => w.includes("inclinado"))).toBe(true);
  });
});
