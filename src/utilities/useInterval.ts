import { useEffect, useRef } from "react";

// Local replacement for the abandoned @use-it/interval package, whose
// package.json "module" field points at a file that does not exist in the
// published tarball. Based on Dan Abramov's classic useInterval:
// https://overreacted.io/making-setinterval-declarative-with-react-hooks/
export default function useInterval(
  callback: () => void,
  delay: number | null,
) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) {
      return;
    }
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}
