import type { Route } from "./+types/home";


export function meta({}: Route.MetaArgs) {
  return [
    { title: "Home" },
    { description: "AccessCounter Frontend" }
  ];
}

export default function Home() {
  //return < />;
}
