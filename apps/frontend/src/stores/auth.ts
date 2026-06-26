import { create } from "zustand";

interface AuthState {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
  login: (token: string, username: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("token"),
  username: localStorage.getItem("username"),
  isAuthenticated: !!localStorage.getItem("token"),
  login: (token: string, username: string) => {
    localStorage.setItem("token", token);
    localStorage.setItem("username", username);
    set({ token, username, isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    set({ token: null, username: null, isAuthenticated: false });
  },
}));
