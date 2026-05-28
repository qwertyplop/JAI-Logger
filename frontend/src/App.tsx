import { Route, Switch } from "wouter";
import Home from "./pages/home";
import AdminPanel from "./pages/admin";

export default function App() {
  return (
    <div className="relative min-h-screen bg-zinc-950 text-zinc-100">
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/admin" component={AdminPanel} />
        <Route><div>404 Not Found</div></Route>
      </Switch>
    </div>
  );
}
