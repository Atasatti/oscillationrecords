import Image from "next/image";

const leftColumn = [
  { id: 1, image: "/artwork1.jpeg", title: "Artwork 1" },
  { id: 2, image: "/artwork2.jpeg", title: "Artwork 2" },
  { id: 3, image: "/artwork3.jpeg", title: "Artwork 3" },
  { id: 4, image: "/artwork4.jpeg", title: "Artwork 4" },
  { id: 9, image: "/artwork9.jpeg", title: "Artwork 9" },
];

const rightColumn = [
  { id: 5, image: "/artwork5.jpeg", title: "Artwork 5" },
  { id: 6, image: "/artwork6.jpeg", title: "Artwork 6" },
  { id: 7, image: "/artwork7.jpeg", title: "Artwork 7" },
  { id: 8, image: "/artwork8.jpeg", title: "Artwork 8" },
];

export default function AlbumLayout() {
  return (
    <div className="h-screen p-6 overflow-hidden w-4/10">
      <div className="h-full max-w-4xl mx-auto -mt-32">
        <div className="grid grid-cols-2 gap-6 h-full">
          {/* Left Column */}
          <div className="flex flex-col gap-6">
            {leftColumn.map((card) => (
              <div
                key={card.id}
                className="relative rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300"
              >
                <Image
                  src={card.image}
                  alt={card.title}
                  width={250}
                  height={400}
                  className="w-full h-auto object-cover"
                />
              </div>
            ))}
          </div>

          {/* Right Column - Offset downward */}
          <div className="flex flex-col gap-6 pt-20">
            {rightColumn.map((card) => (
              <div
                key={card.id}
                className="relative rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300"
              >
                <Image
                  src={card.image}
                  alt={card.title}
                  width={250}
                  height={400}
                  className="w-full h-auto object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
