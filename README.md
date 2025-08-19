
# Proyecto Next.js

Este es un proyecto [Next.js](https://nextjs.org) creado con [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 🚀 Primeros pasos

Ejecuta el servidor de desarrollo:

```bash
npm run dev
# o
yarn dev
# o
pnpm dev
# o
bun dev
````

Abre [http://localhost:3000](http://localhost:3000) en tu navegador para ver el resultado.

Puedes empezar a editar la página modificando `app/page.tsx`.
La página se actualiza automáticamente al guardar los cambios.

Este proyecto usa [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) para optimizar y cargar automáticamente [Geist](https://vercel.com/font), una nueva tipografía creada por Vercel.

## 📚 Aprende más

Para aprender más sobre Next.js, revisa los siguientes recursos:

* [Documentación de Next.js](https://nextjs.org/docs) - Aprende sobre sus características y API.
* [Curso interactivo de Next.js](https://nextjs.org/learn).

También puedes consultar el [repositorio oficial en GitHub](https://github.com/vercel/next.js), tus sugerencias y contribuciones son bienvenidas.

## ☁️ Despliegue en Vercel

La forma más sencilla de desplegar tu app Next.js es con la [plataforma de Vercel](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme), creada por los autores de Next.js.

Consulta la [documentación de despliegue](https://nextjs.org/docs/app/building-your-application/deploying) para más detalles.

---

## 📝 Estándares de Commits

Este proyecto sigue la convención [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) para mantener un historial de Git limpio y significativo.

### 🔑 Estructura

```
<type>(<scope>): <resumen corto>
<línea en blanco>
<body>
<línea en blanco>
<footer>
```

### 🎯 Tipos

1. **feat** → Nueva funcionalidad
2. **fix** → Corrección de errores
3. **chore** → Tareas de mantenimiento (configs, dependencias, build, etc.)
4. **docs** → Documentación
5. **style** → Cambios de estilo (formato, espacios, comillas, linting, etc.)
6. **refactor** → Cambio en el código que no corrige ni agrega features
7. **test** → Agregar o corregir tests
8. **perf** → Mejoras de rendimiento
9. **ci** → Cambios en pipelines, GitHub Actions, etc.
10. **build** → Cambios en dependencias, empaquetado o compilación

### 🖊️ Resumen

* Escribir en **modo imperativo**: "agrega", "corrige", "actualiza" (❌ no “agregado”, “corregido”).
* Breve, máximo \~50 caracteres.

### 📄 Cuerpo (opcional)

* Explica **qué** y **por qué**, no necesariamente el cómo.
* Puede ser en párrafos o viñetas.

### 🔗 Pie (opcional)

* Referencias a issues o tareas: `Closes #123`
* Cambios incompatibles:

  ```
  BREAKING CHANGE: descripción del cambio
  ```

---

✅ **Ejemplo**

```
feat(api): agrega endpoint de perfil de usuario

- Implementa la ruta `/api/profile`
- Agrega validación de entradas del usuario
- Actualiza el schema de Prisma para incluir perfil de usuario

Closes #45
```

