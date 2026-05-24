let verticalOffset = 10;

        //This only works if there is no directionality
        let TempStore = null
        if (targetPos.x <sourcePos.x){
            TempStore = targetPos
            targetPos = sourcePos
            sourcePos = TempStore
        }
        
        const dx = targetPos.x - sourcePos.x;
        const dy = targetPos.y - sourcePos.y;
        let midX = sourcePos.x + dx / 2;

        if (buttonState.binaryVariable) {
            const srcId = typeof d.source === "object" ? d.source.id : d.source;
            const tgtId = typeof d.target === "object" ? d.target.id : d.target;
            const entries = [...graph.edgeEntries(srcId, tgtId)];

            if (entries.length > 0) {
                const attributes = entries[0].attributes;
                if (attributes.codeshare === "Y") {
                    verticalOffset = 10;
                    //midX = sourcePos.x + dx * 0.75;
                } else {
                    verticalOffset = 10;
                    //midX = sourcePos.x + dx * 0.75;
                }
            }
        }

        const controlY1 = sourcePos.y + (dy > 0 ? verticalOffset : -verticalOffset);
        const controlY2 = targetPos.y + (dy > 0 ? -verticalOffset : verticalOffset);

        return `M${sourcePos.x},${sourcePos.y}
                C${midX},${controlY1}
                ${midX},${controlY2}
                ${targetPos.x},${targetPos.y}`;