import { configure } from "@testing-library/react";

// Under a full parallel run, findBy/waitFor can need more than the 1 s default.
configure({ asyncUtilTimeout: 5000 });
