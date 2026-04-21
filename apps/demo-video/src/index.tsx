/**
 * Remotion entry — registers the Nomos demo composition.
 */

import { Composition, registerRoot } from "remotion";
import { NomosDemo } from "./NomosDemo";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;
const DURATION_SECONDS = 22;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="nomos-demo"
        component={NomosDemo}
        durationInFrames={FPS * DURATION_SECONDS}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};

registerRoot(RemotionRoot);
