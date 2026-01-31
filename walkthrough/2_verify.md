# Step 2: Verify the "Box"

Once your sandbox is created, open the folder.

### Check the Locks
1.  Open the `input/` folder.
2.  Notice that inside the container, this is **Read-Only**.
3.  Check `.devcontainer/devcontainer.json` to see the `readonly` mount.

Your environment is now safe from accidental data modification.
