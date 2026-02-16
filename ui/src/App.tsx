import { css } from "@emotion/react";
import { useEffect, useState } from "react";
import { Theme } from "@radix-ui/themes";

export default function App() {
  return (
    <Theme
      appearance="dark"
      css={{
        minHeight: "100%",
        maxHeight: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <h1>
        Welcome to Machi!
      </h1>
    </Theme>
  );
}
