import { Plugin } from 'vite';

interface LovableTaggerOptions {
    jsxSource?: boolean;
    tailwindConfig?: boolean;
}
declare function lovableTagger({ jsxSource, tailwindConfig, }?: LovableTaggerOptions): Plugin;

export { type LovableTaggerOptions, lovableTagger as componentTagger };
