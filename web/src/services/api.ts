const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

class ApiService {
  private getHeaders(): HeadersInit {
    const token = localStorage.getItem("token");
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = this.getHeaders();
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {}),
      },
    });

    if (response.status === 401) {
      // Token expired or invalid, clear storage
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      window.location.href = "/login";
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Ocorreu um erro no servidor.");
    }

    return response.json();
  }

  getWebSocketUrl(endpoint: string): string {
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const baseUrl = API_BASE_URL.replace(/^https?:\/\//, "");
    return `${wsProto}//${baseUrl}${endpoint}`;
  }
}

export const api = new ApiService();
