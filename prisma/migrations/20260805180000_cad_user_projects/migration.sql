-- CreateTable
CREATE TABLE "cad_user_projects" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cad_user_projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cad_user_projects_user_id_idx" ON "cad_user_projects"("user_id");

-- CreateIndex
CREATE INDEX "cad_user_projects_updated_at_idx" ON "cad_user_projects"("updated_at");

-- AddForeignKey
ALTER TABLE "cad_user_projects" ADD CONSTRAINT "cad_user_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
