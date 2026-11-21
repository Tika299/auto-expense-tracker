// src/app.d.ts (hoặc env.d.ts)

// Dành cho CSS Modules (lỗi 1)
declare module '*.module.css' {
    const classes: { readonly [key: string]: string };
    export default classes;
}

// Dành cho global CSS (lỗi 3)
declare module '*.css' {
    const content: { [className: string]: string };
    export default content;
}