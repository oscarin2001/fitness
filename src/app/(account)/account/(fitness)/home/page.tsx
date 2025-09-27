// Placeholder page to fix build error: file was empty and not treated as a module.
// TODO: Replace with actual Fitness Home content.

export const metadata = {
	title: 'Inicio Fitness',
};

export default function FitnessHomePage() {
	return (
		<div className="p-6">
			<h1 className="text-2xl font-semibold">Inicio Fitness</h1>
			<p className="text-sm text-muted-foreground mt-2">Esta página es un placeholder temporal. Reemplaza el contenido cuando definas el dashboard fitness.</p>
		</div>
	);
}

