"use client";

import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export function AuthProvider({ children }) {

  const [user, setUser] = useState(undefined);
  const [token, setToken] = useState(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    try {

      const savedToken = localStorage.getItem("token");
      const savedUser = localStorage.getItem("user");

      if (savedToken && savedUser && savedUser !== "undefined") {

        const parsedUser = JSON.parse(savedUser);

        setToken(savedToken);
        setUser(parsedUser);

      }

    } catch (error) {

      console.error("Auth restore failed:", error);

      localStorage.removeItem("token");
      localStorage.removeItem("user");

    }

    setLoading(false);

  }, []);

  function login(userData, tokenData) {

    setUser(userData);
    setToken(tokenData);

    localStorage.setItem("token", tokenData);
    localStorage.setItem("user", JSON.stringify(userData));

  }

  function logout() {

    setUser(null);
    setToken(null);

    localStorage.removeItem("token");
    localStorage.removeItem("user");

  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        loading,
        isAuthenticated: !!token
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}