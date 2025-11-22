/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: '#0f172a', // Slate 900
                surface: '#1e293b', // Slate 800
                surfaceHighlight: '#334155', // Slate 700
                primary: '#3b82f6', // Blue 500
                primaryHover: '#2563eb', // Blue 600
                secondary: '#64748b', // Slate 500
                accent: '#06b6d4', // Cyan 500
                success: '#10b981', // Emerald 500
                warning: '#f59e0b', // Amber 500
                error: '#ef4444', // Red 500
                text: {
                    primary: '#f8fafc', // Slate 50
                    secondary: '#94a3b8', // Slate 400
                    muted: '#64748b', // Slate 500
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            boxShadow: {
                'glow': '0 0 20px rgba(59, 130, 246, 0.5)',
                'card': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            }
        },
    },
    plugins: [],
}
